import { EventEmitter } from 'events';
import { ISocket } from '@core/interfaces/ISocket.js';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        lastError?: {
          message?: string;
        };
      };
      sockets?: {
        tcp?: {
          create: (properties: any, callback: (socketInfo: any) => void) => void;
          connect: (socketId: number, peerInfo: any, callback: () => void) => void;
          send: (socketId: number, data: ArrayBuffer, callback: (info: any) => void) => void;
          disconnect: (socketId: number, callback: () => void) => void;
          close: (socketId: number, callback: () => void) => void;
          getInfo: (socketId: number, callback: (info: any) => void) => void;
          setPaused: (socketId: number, paused: boolean, callback: () => void) => void;
          onReceive: { addListener: (callback: (info: any) => void) => void; removeListener: (callback: (info: any) => void) => void };
          onReceiveError: { addListener: (callback: (info: any) => void) => void; removeListener: (callback: (info: any) => void) => void };
        };
      };
    };
  }
}

export class CapacitorSocketAdapter extends EventEmitter implements ISocket {
  private socketId: number | null = null;
  private destroyedValue: boolean = false;
  private pausedValue: boolean = false;
  private writeCallbacks: Array<(err?: Error | null) => void> = [];

  constructor() {
    super();
  }

  async connect(hostname: string, port: number, useSSL: boolean): Promise<void> {
    if (useSSL) {
      throw new Error('SSL not yet supported for Capacitor socket adapter');
    }

    if (typeof window === 'undefined' || !window.chrome?.sockets?.tcp) {
      throw new Error('chrome.sockets.tcp not available');
    }

    return new Promise((resolve, reject) => {
      (window.chrome!.sockets!.tcp as any).create(
        { persistent: false, name: 'nntp' },
        (socketInfo: any) => {
          if ((window.chrome as any).runtime?.lastError) {
            reject(new Error(`Failed to create socket: ${(window.chrome as any).runtime!.lastError!.message}`));
            return;
          }

          this.socketId = socketInfo.socketId;

          (window.chrome!.sockets!.tcp as any).connect(
            this.socketId!,
            { host: hostname, port: port },
            () => {
              if ((window.chrome as any).runtime?.lastError) {
                this.cleanup();
                reject(new Error(`Connection failed: ${(window.chrome as any).runtime?.lastError!.message}`));
                return;
              }

              this.setupEventListeners();
              this.emit('connect');
              resolve();
            }
          );
        }
      );
    });
  }

  private setupEventListeners(): void {
    if (!window.chrome?.sockets?.tcp) {
      return;
    }

    window.chrome.sockets.tcp.onReceive.addListener((info) => {
      if (info.socketId === this.socketId) {
        const data = new Uint8Array(info.data);
        const buffer = Buffer.from(data);
        this.emit('data', buffer);
      }
    });

    window.chrome.sockets.tcp.onReceiveError.addListener((info) => {
      if (info.socketId === this.socketId) {
        const err = new Error(`Socket receive error: ${info.resultCode}`);
        this.destroyedValue = true;
        this.emit('error', err);
        this.emit('close', true);
      }
    });
  }

  write(data: string, encoding: BufferEncoding, callback?: (err?: Error | null) => void): boolean {
    if (this.socketId === null || typeof window === 'undefined' || !window.chrome?.sockets?.tcp) {
      callback?.(new Error('Socket not available'));
      return false;
    }

    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);

    window.chrome.sockets.tcp.send(this.socketId!, buffer.buffer, (sendInfo) => {
      if (window.chrome!.runtime?.lastError || sendInfo.resultCode < 0) {
        const err = new Error(`Send failed: ${window.chrome!.runtime?.lastError?.message || sendInfo.resultCode}`);
        callback?.(err);
      } else {
        callback?.(null);
      }
    });

    return true;
  }

  pause(): void {
    if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
      window.chrome.sockets.tcp.setPaused(this.socketId, true, () => {});
    }
    this.pausedValue = true;
  }

  resume(): void {
    if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
      window.chrome.sockets.tcp.setPaused(this.socketId, false, () => {});
    }
    this.pausedValue = false;
  }

  end(): void {
    this.disconnectSocket();
  }

  destroy(): void {
    this.destroyedValue = true;
    this.cleanup();
  }

  private disconnectSocket(): void {
    if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
      window.chrome.sockets.tcp.disconnect(this.socketId, () => {});
    }
  }

  private cleanup(): void {
    this.disconnectSocket();
    if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
      window.chrome.sockets.tcp.close(this.socketId, () => {});
      this.socketId = null;
    }
  }

  get destroyed(): boolean {
    return this.destroyedValue;
  }

  isPaused(): boolean {
    return this.pausedValue;
  }
}
