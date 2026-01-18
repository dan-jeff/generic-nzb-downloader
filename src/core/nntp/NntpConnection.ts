import { Readable } from 'stream';
import { INetwork, NetworkFactory } from '@core/interfaces/INetwork.js';

export class NntpConnection {
  private networkFactory: NetworkFactory;
  private network: INetwork | null = null;
  private hostname: string;
  private port: number;
  private useSSL: boolean;
  private username?: string;
  private password?: string;
  private connected: boolean = false;
  private currentGroup?: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelayMs: number = 1000;
  private articleTimeoutMs: number;
  private connectTimeoutMs: number = 60000;
  private responseBuffer: string = '';
  private outputStream: Readable | null = null;
  private onStreamStart: (() => void) | null = null;

  constructor(networkFactory: NetworkFactory, articleTimeoutMs: number = 60000) {
    this.networkFactory = networkFactory;
    this.hostname = '';
    this.port = 119;
    this.useSSL = false;
    this.articleTimeoutMs = articleTimeoutMs;
    console.log(`[NntpConnection] Created with timeout: ${articleTimeoutMs}ms`);
  }

  async connect(hostname: string, port: number, useSSL: boolean, username?: string, password?: string): Promise<void> {
    this.hostname = hostname;
    this.port = port;
    this.useSSL = useSSL;
    this.username = username;
    this.password = password;
    this.responseBuffer = '';

    console.log(`[NntpConnection] connect called: ${hostname}:${port}, SSL: ${useSSL}, username: ${!!username}`);
    console.log(`[NntpConnection] Connection timeout: ${this.connectTimeoutMs}ms`);

    console.log('[NntpConnection] About to create network instance via networkFactory');

    console.log('[NntpConnection] About to call network.connect() with:', { host: hostname, port, useSSL });

    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        console.error(`[NntpConnection] Connection timeout after ${this.connectTimeoutMs}ms`);
        this.connected = false;
        this.network?.destroy();
        reject(new Error(`Connection timeout after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      try {
        console.log('[NntpConnection] About to create network instance via networkFactory');
        this.network = this.networkFactory();
        console.log('[NntpConnection] Network instance created, type:', this.network.constructor.name);

        this.network.on('connect', () => {
          console.log('[NntpConnection] Network connect event received');
          clearTimeout(connectTimeout);
        });

        this.network.on('data', (data: Buffer) => {
          // console.log(`[NntpConnection] Received ${data.length} bytes`);
          this.responseBuffer += data.toString('latin1');
          
          // Diagnostic: Check buffer size
          if (this.responseBuffer.length > 1024 * 1024) {
             console.warn(`[NntpConnection] WARNING: Response buffer growing large: ${Math.round(this.responseBuffer.length / 1024)}KB`);
          }
          
          this.processResponseBuffer();
        });

        this.network.on('error', (err: Error) => {
          console.error('[NntpConnection] Network error event:', err.message);
          clearTimeout(connectTimeout);
          this.connected = false;
          reject(err);
        });

        this.network.on('close', (hadErr: boolean) => {
          console.log(`[NntpConnection] Network close event, hadError: ${hadErr}`);
          clearTimeout(connectTimeout);
          if (hadErr) {
            this.connected = false;
            reject(new Error('Connection closed due to error'));
          }
        });

        console.log(`[NntpConnection] Calling network.connect(${hostname}:${port}, SSL: ${useSSL})...`);
        this.network.connect(hostname, port, useSSL)
          .then(() => {
            console.log('[NntpConnection] network.connect() promise resolved');
            this.readGreeting()
              .then(() => {
                console.log('[NntpConnection] Greeting read successfully');
                this.authenticate()
                  .then(() => {
                    console.log('[NntpConnection] Authentication successful');
                    this.connected = true;
                    resolve();
                  })
                  .catch((authErr) => {
                    console.error('[NntpConnection] Authentication failed:', authErr);
                    this.connected = false;
                    reject(authErr);
                  });
              })
              .catch((err) => {
                console.error('[NntpConnection] Failed to read greeting:', err);
                this.connected = false;
                reject(err);
              });
          })
          .catch((err) => {
            console.error('[NntpConnection] network.connect() promise rejected:', err);
            clearTimeout(connectTimeout);
            this.connected = false;
            reject(err);
          });

      } catch (err) {
        console.error('[NntpConnection] Exception during connection setup:', err);
        clearTimeout(connectTimeout);
        reject(err);
      }
    });
  }

  private async readGreeting(): Promise<void> {
    console.log('[NntpConnection] Waiting for server greeting...');
    const response = await this.readResponse();
    console.log('[NntpConnection] Greeting received:', response.trim());
    const code = parseInt(response.substring(0, 3), 10);
    if (code !== 200 && code !== 201) {
      console.error(`[NntpConnection] Unexpected greeting code ${code}:`, response.trim());
      throw new Error(`Unexpected greeting: ${response}`);
    }
  }

  private async authenticate(): Promise<void> {
    if (!this.username || !this.password) {
      return;
    }

    console.log(`[NntpConnection] Sending AUTHINFO USER with username: ${this.username}`);
    const userResponse = await this.sendCommand(`AUTHINFO USER ${this.username}`);
    console.log(`[NntpConnection] AUTHINFO USER response:`, userResponse.trim());
    const userCode = parseInt(userResponse.substring(0, 3), 10);

    if (userCode === 381) {
      console.log('[NntpConnection] Sending AUTHINFO PASS');
      const passResponse = await this.sendCommand(`AUTHINFO PASS ${this.password}`);
      console.log(`[NntpConnection] AUTHINFO PASS response:`, passResponse.trim());
      const passCode = parseInt(passResponse.substring(0, 3), 10);
      console.log(`[NntpConnection] AUTHINFO PASS response code: ${passCode}`);
      if (passCode !== 281) {
        console.error(`[NntpConnection] AUTHINFO PASS failed with code ${passCode}:`, passResponse.trim());
        throw new Error(`Authentication failed: ${passResponse}`);
      }
    } else if (userCode !== 281) {
      console.error(`[NntpConnection] AUTHINFO USER failed with code ${userCode}:`, userResponse.trim());
      throw new Error(`Authentication failed: ${userResponse}`);
    }
  }

  private async sendCommand(command: string, options: { multiline?: boolean } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        reject(new Error(`Timeout waiting for response to: ${command}`));
      }, this.articleTimeoutMs);

      this.expectMultiLine = Boolean(options.multiline);
      this.commandCallback = (response: string, error: Error | null) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      };

      try {
        console.log(`[NntpConnection] Sending command: ${command.substring(0, 100)}`);
        this.network?.resume();
        this.network?.write(`${command}\r\n`, 'utf-8', (err) => {
          if (err) {
            clearTimeout(timeout);
            this.commandCallback = null;
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        this.commandCallback = null;
        reject(err);
      }
    });
  }

  private commandCallback: ((response: string, error: Error | null) => void) | null = null;
  private pendingMultiLine: boolean = false;
  private expectMultiLine: boolean = false;
  private multiLineBuffer: string[] = [];

  private processResponseBuffer(): void {
    while (true) {
      const newlineIndex = this.responseBuffer.indexOf('\r\n');
      if (newlineIndex === -1) {
        break;
      }

      const line = this.responseBuffer.substring(0, newlineIndex);
      this.responseBuffer = this.responseBuffer.substring(newlineIndex + 2);

      if (!this.pendingMultiLine) {
        if (line.trim().length === 0) {
           continue; 
        }

        const code = parseInt(line.substring(0, 3), 10);
        if (isNaN(code)) {
          // Recovery: If we are expecting a multiline response, but get data that isn't a code,
          // assume we missed the header (e.g. 222) and treat this as the start of the body.
          if (this.expectMultiLine) {
             console.warn(`[NntpConnection] Missing status code (expected multiline), treating line as body data. Hex: ${Buffer.from(line.substring(0, Math.min(10, line.length))).toString('hex')}`);
             this.expectMultiLine = false;
             this.pendingMultiLine = true;
             this.multiLineBuffer = []; // Start buffer
             
             if (this.onStreamStart) {
               this.onStreamStart();
               this.onStreamStart = null;
             }
             
             // Process this line as body data immediately
             this.processBodyLine(line);
             continue;
          }

          console.error(`[NntpConnection] Invalid response code received. Line length: ${line.length}`);
          console.error(`[NntpConnection] Line content (first 100 chars): ${line.substring(0, 100)}`);
          console.error(`[NntpConnection] Line hex: ${Buffer.from(line.substring(0, Math.min(20, line.length))).toString('hex')}`);
          
          if (this.commandCallback) {
            this.commandCallback('', new Error(`Invalid response: ${line.substring(0, 100)}`));
            this.commandCallback = null;
          }
          return;
        }

        if (this.expectMultiLine) {
          this.expectMultiLine = false;
          if (code === 220 || code === 222) {
            console.log(`[NntpConnection] Starting multiline response for code ${code}`);
            this.pendingMultiLine = true;
            this.multiLineBuffer = [line];
            if (this.onStreamStart) {
              this.onStreamStart();
              this.onStreamStart = null;
            }
            continue;
          }
        }

        if (this.commandCallback) {
          console.log(`[NntpConnection] Command response received: ${line.substring(0, 200)}`);
          this.commandCallback(line, null);
          this.commandCallback = null;
        }
      } else {
        if (line === '.') {
          console.log('[NntpConnection] Multiline response terminator (.) received');
          this.pendingMultiLine = false;
          if (this.outputStream) {
            this.outputStream.push(null);
            this.outputStream = null;
            this.network?.resume();
          } else {
            const response = this.multiLineBuffer.join('\r\n');
            if (this.commandCallback) {
              this.commandCallback(response, null);
              this.commandCallback = null;
            }
            this.multiLineBuffer = [];
          }
        } else {
          this.processBodyLine(line);
        }
      }
    }
  }

  private processBodyLine(line: string): void {
    let dataLine = line;
    if (dataLine.startsWith('..')) {
      dataLine = dataLine.substring(1);
    }
    if (this.outputStream) {
      if (!this.outputStream.push(dataLine)) {
        this.network?.pause();
      }
    } else {
      this.multiLineBuffer.push(dataLine);
    }
  }

  private async readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        reject(new Error('Timeout waiting for response'));
      }, this.articleTimeoutMs);

      this.commandCallback = (response: string, error: Error | null) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      };
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`[NntpConnection] Reconnecting (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      this.reconnectAttempts++;
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelayMs));
      await this.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
    }
    if (!this.connected) {
      console.error('[NntpConnection] ensureConnected failed - not connected after attempts');
      throw new Error('NNTP connection failed');
    }
  }

  async getBody(messageId: string): Promise<string> {
    await this.ensureConnected();

    console.log(`[NntpConnection] Requesting BODY for message ID: ${messageId}`);
    console.log('[NntpConnection] About to call network.write() for BODY command');
    const response = await this.sendCommand(`BODY <${messageId}>`, { multiline: true });
    console.log('[NntpConnection] BODY response received, length:', response.length);
    const code = parseInt(response.substring(0, 3), 10);

    if (code !== 220 && code !== 222) {
      this.connected = false;
      throw new Error(`Failed to get body: ${response}`);
    }

    const body = response.substring(response.indexOf('\r\n') + 2);
    return body;
  }

  async getArticleStream(messageId: string): Promise<Readable> {
    await this.ensureConnected();
    const command = `BODY <${messageId}>`;

    console.log(`[NntpConnection] Requesting BODY stream for message ID: ${messageId}`);
    console.log('[NntpConnection] About to call network.write() for BODY stream command');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        this.outputStream = null;
        this.onStreamStart = null;
        reject(new Error(`Timeout waiting for stream response to: ${command}`));
      }, this.articleTimeoutMs);

      this.expectMultiLine = true;

      this.commandCallback = (response: string, error: Error | null) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          reject(new Error(`Unexpected single line response: ${response}`));
        }
      };

      this.onStreamStart = () => {
        clearTimeout(timeout);
        console.log('[NntpConnection] BODY stream started receiving data');
        const stream = new Readable({
          objectMode: true,
          read: () => {
            if (this.network && this.network.isPaused()) {
              this.network.resume();
            }
          }
        });
        this.outputStream = stream;

        this.commandCallback = null;

        resolve(stream);
      };

      try {
        this.network?.write(`${command}\r\n`, 'utf-8', (err) => {
          if (err) {
            clearTimeout(timeout);
            this.commandCallback = null;
            this.onStreamStart = null;
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        this.commandCallback = null;
        this.onStreamStart = null;
        reject(err);
      }
    });
  }

  async getArticle(messageId: string): Promise<any> {
    await this.ensureConnected();

    console.log(`[NntpConnection] Requesting ARTICLE for message ID: ${messageId}`);
    const response = await this.sendCommand(`ARTICLE <${messageId}>`, { multiline: true });
    console.log('[NntpConnection] ARTICLE response received, length:', response.length);
    const code = parseInt(response.substring(0, 3), 10);

    if (code !== 220) {
      this.connected = false;
      throw new Error(`Failed to get article: ${response}`);
    }

    const separatorIndex = response.indexOf('\r\n\r\n');
    if (separatorIndex === -1) {
      return { headers: {}, body: response.substring(response.indexOf('\r\n') + 2) };
    }

    const headersPart = response.substring(response.indexOf('\r\n') + 2, separatorIndex);
    const bodyPart = response.substring(separatorIndex + 4);

    const headers: any = {};
    const headerLines = headersPart.split('\r\n');
    for (const line of headerLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        headers[name] = value;
      }
    }

    return { headers, body: bodyPart };
  }

  async setGroup(group: string): Promise<void> {
    await this.ensureConnected();

    console.log(`[NntpConnection] Sending GROUP command for: ${group}`);
    const response = await this.sendCommand(`GROUP ${group}`);
    console.log('[NntpConnection] GROUP response:', response.trim());
    const code = parseInt(response.substring(0, 3), 10);

    if (code !== 211) {
      this.connected = false;
      throw new Error(`Failed to set group: ${response}`);
    }

    this.currentGroup = group;
  }

  disconnect(): void {
    console.log('[NntpConnection] disconnect called');
    this.connected = false;
    this.currentGroup = undefined;
    this.responseBuffer = '';
    this.commandCallback = null;
    this.pendingMultiLine = false;
    this.multiLineBuffer = [];
    if (this.outputStream) {
      this.outputStream.destroy();
      this.outputStream = null;
    }
    this.onStreamStart = null;
    try {
      if (this.network && !this.network.destroyed) {
        this.network.end();
        this.network.destroy();
      }
    } catch (err) {
      console.error('Error disconnecting NNTP client:', err);
    }
    this.network = null;
  }

  isConnected(): boolean {
    return this.connected && this.network !== null && !this.network.destroyed;
  }

  getCurrentGroup(): string | undefined {
    return this.currentGroup;
  }
}
