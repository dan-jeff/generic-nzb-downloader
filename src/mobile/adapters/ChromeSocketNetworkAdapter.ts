import { EventEmitter } from 'events';
import { INetwork } from '@core/interfaces/INetwork.js';

declare const chrome: any;

/**
 * Network adapter using cordova-plugin-chrome-apps-sockets-tcp
 * This is a mature Cordova plugin that should work reliably on Android
 */
export class ChromeSocketNetworkAdapter extends EventEmitter implements INetwork {
  private socketId: number | null = null;
  private isConnected: boolean = false;
  public destroyed: boolean = false;
  private paused: boolean = false;
  private readBuffer: Buffer[] = [];

  constructor() {
    super();
    console.log('[ChromeSocketNetworkAdapter] Created');
  }

  async connect(host: string, port: number, useSSL: boolean): Promise<void> {
    console.log(`[ChromeSocketNetworkAdapter] connect called: ${host}:${port}, SSL: ${useSSL}`);
    
    return new Promise((resolve, reject) => {
      if (!chrome || !chrome.sockets || !chrome.sockets.tcp) {
        const error = 'chrome.sockets.tcp API not available';
        console.error('[ChromeSocketNetworkAdapter]', error);
        reject(new Error(error));
        return;
      }

      console.log('[ChromeSocketNetworkAdapter] Creating socket...');
      chrome.sockets.tcp.create({}, (createInfo: any) => {
        // Check for errors - Cordova Chrome Apps doesn't use chrome.runtime.lastError
        if (!createInfo || createInfo.socketId === undefined) {
          console.error('[ChromeSocketNetworkAdapter] Socket creation failed: invalid createInfo', createInfo);
          reject(new Error('Socket creation failed'));
          return;
        }

        this.socketId = createInfo.socketId;
        console.log(`[ChromeSocketNetworkAdapter] Socket created with ID: ${this.socketId}`);

        // Set up receive listener BEFORE connecting
        chrome.sockets.tcp.onReceive.addListener((info: any) => {
          if (info.socketId === this.socketId) {
            console.log('[ChromeSocketNetworkAdapter] onReceive called, info:', JSON.stringify({
              socketId: info.socketId,
              hasData: !!info.data,
              dataType: typeof info.data,
              dataConstructor: info.data ? info.data.constructor.name : 'N/A',
              byteLength: info.data ? info.data.byteLength : 'N/A'
            }));
            
            // info.data is an ArrayBuffer
            const byteLength = info.data ? info.data.byteLength : 0;
            
            if (byteLength === 0 || !info.data) {
              console.warn('[ChromeSocketNetworkAdapter] Received 0 bytes or no data - this might be a ready signal, not actual data');
              // Don't skip - maybe more data is coming. Just return and wait for next onReceive
              return;
            }
            
            // Convert ArrayBuffer to Buffer
            const uint8Array = new Uint8Array(info.data);
            const buffer = Buffer.from(uint8Array);
            
            console.log(`[ChromeSocketNetworkAdapter] Buffer created, length: ${buffer.length}, first bytes: ${buffer.slice(0, Math.min(20, buffer.length)).toString('hex')}`);
            console.log(`[ChromeSocketNetworkAdapter] Buffer as string: ${buffer.toString('utf8', 0, Math.min(50, buffer.length))}`);
            
            if (!this.paused) {
              this.emit('data', buffer);
            } else {
              this.readBuffer.push(buffer);
            }
          }
        });

        chrome.sockets.tcp.onReceiveError.addListener((info: any) => {
          if (info.socketId === this.socketId) {
            console.error('[ChromeSocketNetworkAdapter] Receive error:', info.resultCode);
            this.emit('error', new Error(`Socket error: ${info.resultCode}`));
            this.emit('close', true);
          }
        });

        console.log('[ChromeSocketNetworkAdapter] Connecting to ${host}:${port}...');
        chrome.sockets.tcp.connect(this.socketId, host, port, (result: number) => {
          if (result < 0) {
            console.error(`[ChromeSocketNetworkAdapter] Connection failed with code: ${result}`);
            reject(new Error(`Connection failed: ${result}`));
            return;
          }

          console.log('[ChromeSocketNetworkAdapter] TCP connection established');
          
          // Unpause immediately after TCP connection (before TLS)
          console.log('[ChromeSocketNetworkAdapter] Unpausing socket before TLS...');
          chrome.sockets.tcp.setPaused(this.socketId, false, () => {
            console.log('[ChromeSocketNetworkAdapter] Socket unpaused');

            if (useSSL) {
              console.log('[ChromeSocketNetworkAdapter] Securing connection with TLS...');
              chrome.sockets.tcp.secure(this.socketId, (secureResult: number) => {
                if (secureResult !== 0) {
                  console.error(`[ChromeSocketNetworkAdapter] TLS handshake failed with code: ${secureResult}`);
                  reject(new Error(`TLS handshake failed: ${secureResult}`));
                  return;
                }

                console.log('[ChromeSocketNetworkAdapter] TLS handshake complete');
                this.isConnected = true;
                this.emit('connect');
                resolve();
              });
            } else {
              console.log('[ChromeSocketNetworkAdapter] Connection complete (no TLS)');
              this.isConnected = true;
              this.emit('connect');
              resolve();
            }
          });
        });
      });
    });
  }

  write(data: string | Buffer, encoding?: BufferEncoding, callback?: (error?: Error | null) => void): boolean {
    if (!this.socketId || !this.isConnected) {
      const error = new Error('Socket not connected');
      if (callback) callback(error);
      return false;
    }

    const buffer = typeof data === 'string' ? Buffer.from(data, encoding || 'utf-8') : data;
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    console.log(`[ChromeSocketNetworkAdapter] Writing ${buffer.length} bytes`);
    
    chrome.sockets.tcp.send(this.socketId, arrayBuffer, (sendInfo: any) => {
      if (sendInfo.resultCode < 0) {
        const error = new Error(`Send failed: ${sendInfo.resultCode}`);
        console.error('[ChromeSocketNetworkAdapter]', error.message);
        if (callback) callback(error);
      } else {
        console.log(`[ChromeSocketNetworkAdapter] Sent ${sendInfo.bytesSent} bytes`);
        if (callback) callback(null);
      }
    });

    return true;
  }

  end(): void {
    console.log('[ChromeSocketNetworkAdapter] end() called');
    this.destroy();
  }

  destroy(): void {
    console.log('[ChromeSocketNetworkAdapter] destroy() called');
    if (this.destroyed) return;
    
    this.destroyed = true;
    this.isConnected = false;

    if (this.socketId !== null) {
      chrome.sockets.tcp.disconnect(this.socketId, () => {
        chrome.sockets.tcp.close(this.socketId!, () => {
          console.log('[ChromeSocketNetworkAdapter] Socket closed');
        });
      });
      this.socketId = null;
    }

    this.emit('close', false);
  }

  pause(): void {
    console.log('[ChromeSocketNetworkAdapter] pause() called');
    this.paused = true;
    chrome.sockets.tcp.setPaused(this.socketId!, true);
  }

  resume(): void {
    console.log('[ChromeSocketNetworkAdapter] resume() called');
    this.paused = false;
    chrome.sockets.tcp.setPaused(this.socketId!, false);
    
    // Emit any buffered data
    while (this.readBuffer.length > 0) {
      const buffer = this.readBuffer.shift()!;
      this.emit('data', buffer);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  on(event: string | symbol, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }

  once(event: string | symbol, listener: (...args: any[]) => void): this {
    super.once(event, listener);
    return this;
  }
}
