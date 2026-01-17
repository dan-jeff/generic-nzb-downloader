import { Readable } from 'stream';
export class NntpConnection {
    networkFactory;
    network = null;
    hostname;
    port;
    useSSL;
    username;
    password;
    connected = false;
    currentGroup;
    reconnectAttempts = 0;
    maxReconnectAttempts = 3;
    reconnectDelayMs = 1000;
    articleTimeoutMs;
    connectTimeoutMs = 30000;
    responseBuffer = '';
    outputStream = null;
    onStreamStart = null;
    constructor(networkFactory, articleTimeoutMs = 15000) {
        this.networkFactory = networkFactory;
        this.hostname = '';
        this.port = 119;
        this.useSSL = false;
        this.articleTimeoutMs = articleTimeoutMs;
        console.log(`[NntpConnection] Created with timeout: ${articleTimeoutMs}ms`);
    }
    async connect(hostname, port, useSSL, username, password) {
        this.hostname = hostname;
        this.port = port;
        this.useSSL = useSSL;
        this.username = username;
        this.password = password;
        this.responseBuffer = '';
        console.log(`[NntpConnection] connect called: ${hostname}:${port}, SSL: ${useSSL}, hasAuth: ${!!username}`);
        console.log(`[NntpConnection] Connection timeout: ${this.connectTimeoutMs}ms`);
        return new Promise((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                console.error(`[NntpConnection] Connection timeout after ${this.connectTimeoutMs}ms`);
                this.connected = false;
                this.network?.destroy();
                reject(new Error(`Connection timeout after ${this.connectTimeoutMs}ms`));
            }, this.connectTimeoutMs);
            try {
                console.log('[NntpConnection] Creating network instance...');
                this.network = this.networkFactory();
                console.log('[NntpConnection] Network instance created:', this.network?.constructor.name);
                this.network.on('connect', () => {
                    console.log('[NntpConnection] Network connect event received');
                    clearTimeout(connectTimeout);
                });
                this.network.on('data', (data) => {
                    console.log(`[NntpConnection] Received ${data.length} bytes`);
                    this.responseBuffer += data.toString('latin1');
                    this.processResponseBuffer();
                });
                this.network.on('error', (err) => {
                    console.error('[NntpConnection] Network error event:', err.message);
                    clearTimeout(connectTimeout);
                    this.connected = false;
                    reject(err);
                });
                this.network.on('close', (hadErr) => {
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
            }
            catch (err) {
                console.error('[NntpConnection] Exception during connection setup:', err);
                clearTimeout(connectTimeout);
                reject(err);
            }
        });
    }
    async readGreeting() {
        const response = await this.readResponse();
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 200 && code !== 201) {
            throw new Error(`Unexpected greeting: ${response}`);
        }
    }
    async authenticate() {
        if (!this.username || !this.password) {
            return;
        }
        const userResponse = await this.sendCommand(`AUTHINFO USER ${this.username}`);
        const userCode = parseInt(userResponse.substring(0, 3), 10);
        if (userCode === 381) {
            const passResponse = await this.sendCommand(`AUTHINFO PASS ${this.password}`);
            const passCode = parseInt(passResponse.substring(0, 3), 10);
            if (passCode !== 281) {
                throw new Error(`Authentication failed: ${passResponse}`);
            }
        }
        else if (userCode !== 281) {
            throw new Error(`Authentication failed: ${userResponse}`);
        }
    }
    async sendCommand(command, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.disconnect();
                reject(new Error(`Timeout waiting for response to: ${command}`));
            }, this.articleTimeoutMs);
            this.expectMultiLine = Boolean(options.multiline);
            this.commandCallback = (response, error) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                    return;
                }
                resolve(response);
            };
            try {
                this.network?.resume();
                this.network?.write(`${command}\r\n`, 'utf-8', (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        this.commandCallback = null;
                        reject(err);
                    }
                });
            }
            catch (err) {
                clearTimeout(timeout);
                this.commandCallback = null;
                reject(err);
            }
        });
    }
    commandCallback = null;
    pendingMultiLine = false;
    expectMultiLine = false;
    multiLineBuffer = [];
    processResponseBuffer() {
        while (true) {
            const newlineIndex = this.responseBuffer.indexOf('\r\n');
            if (newlineIndex === -1) {
                break;
            }
            const line = this.responseBuffer.substring(0, newlineIndex);
            this.responseBuffer = this.responseBuffer.substring(newlineIndex + 2);
            if (!this.pendingMultiLine) {
                const code = parseInt(line.substring(0, 3), 10);
                if (isNaN(code)) {
                    if (this.commandCallback) {
                        this.commandCallback('', new Error(`Invalid response: ${line}`));
                        this.commandCallback = null;
                    }
                    return;
                }
                if (this.expectMultiLine) {
                    this.expectMultiLine = false;
                    if (code === 220 || code === 222) {
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
                    this.commandCallback(line, null);
                    this.commandCallback = null;
                }
            }
            else {
                if (line === '.') {
                    this.pendingMultiLine = false;
                    if (this.outputStream) {
                        this.outputStream.push(null);
                        this.outputStream = null;
                        this.network?.resume();
                    }
                    else {
                        const response = this.multiLineBuffer.join('\r\n');
                        if (this.commandCallback) {
                            this.commandCallback(response, null);
                            this.commandCallback = null;
                        }
                        this.multiLineBuffer = [];
                    }
                }
                else {
                    let dataLine = line;
                    if (dataLine.startsWith('..')) {
                        dataLine = dataLine.substring(1);
                    }
                    if (this.outputStream) {
                        if (!this.outputStream.push(dataLine)) {
                            this.network?.pause();
                        }
                    }
                    else {
                        this.multiLineBuffer.push(dataLine);
                    }
                }
            }
        }
    }
    async readResponse() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.disconnect();
                reject(new Error('Timeout waiting for response'));
            }, this.articleTimeoutMs);
            this.commandCallback = (response, error) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                    return;
                }
                resolve(response);
            };
        });
    }
    async ensureConnected() {
        if (!this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            await new Promise(resolve => setTimeout(resolve, this.reconnectDelayMs));
            await this.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
        }
        if (!this.connected) {
            throw new Error('NNTP connection failed');
        }
    }
    async getBody(messageId) {
        await this.ensureConnected();
        const response = await this.sendCommand(`BODY <${messageId}>`, { multiline: true });
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 220 && code !== 222) {
            this.connected = false;
            throw new Error(`Failed to get body: ${response}`);
        }
        const body = response.substring(response.indexOf('\r\n') + 2);
        return body;
    }
    async getArticleStream(messageId) {
        await this.ensureConnected();
        const command = `BODY <${messageId}>`;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.disconnect();
                this.outputStream = null;
                this.onStreamStart = null;
                reject(new Error(`Timeout waiting for stream response to: ${command}`));
            }, this.articleTimeoutMs);
            this.expectMultiLine = true;
            this.commandCallback = (response, error) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                }
                else {
                    reject(new Error(`Unexpected single line response: ${response}`));
                }
            };
            this.onStreamStart = () => {
                clearTimeout(timeout);
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
            }
            catch (err) {
                clearTimeout(timeout);
                this.commandCallback = null;
                this.onStreamStart = null;
                reject(err);
            }
        });
    }
    async getArticle(messageId) {
        await this.ensureConnected();
        const response = await this.sendCommand(`ARTICLE <${messageId}>`, { multiline: true });
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
        const headers = {};
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
    async setGroup(group) {
        await this.ensureConnected();
        const response = await this.sendCommand(`GROUP ${group}`);
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 211) {
            this.connected = false;
            throw new Error(`Failed to set group: ${response}`);
        }
        this.currentGroup = group;
    }
    disconnect() {
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
        }
        catch (err) {
            console.error('Error disconnecting NNTP client:', err);
        }
        this.network = null;
    }
    isConnected() {
        return this.connected && this.network !== null && !this.network.destroyed;
    }
    getCurrentGroup() {
        return this.currentGroup;
    }
}
