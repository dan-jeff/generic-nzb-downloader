import { EventEmitter } from 'events';
import * as net from 'net';
import * as tls from 'tls';
import { INetwork } from '../../src/core/interfaces/INetwork.js';

export class NodeNetworkAdapter extends EventEmitter implements INetwork {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private destroyedValue: boolean = false;

  async connect(hostname: string, port: number, useSSL: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (useSSL) {
          this.socket = tls.connect({
            host: hostname,
            port: port,
            rejectUnauthorized: false
          });
        } else {
          this.socket = net.connect({
            host: hostname,
            port: port
          });
        }

        this.socket.on('connect', () => {
          this.emit('connect');
          resolve();
        });

        this.socket.on('data', (data: Buffer) => {
          this.emit('data', data);
        });

        this.socket.on('error', (err: Error) => {
          this.emit('error', err);
        });

        this.socket.on('close', (hadError: boolean) => {
          this.destroyedValue = true;
          this.emit('close', hadError);
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  write(data: string, encoding: BufferEncoding, callback?: (err?: Error | null) => void): boolean {
    if (!this.socket) {
      return false;
    }
    return this.socket.write(data, encoding, callback);
  }

  pause(): void {
    this.socket?.pause();
  }

  resume(): void {
    this.socket?.resume();
  }

  end(): void {
    this.socket?.end();
  }

  destroy(): void {
    if (this.socket && !this.destroyedValue) {
      this.socket.destroy();
    }
    this.destroyedValue = true;
  }

  get destroyed(): boolean {
    return this.destroyedValue || (this.socket?.destroyed ?? true);
  }

  isPaused(): boolean {
    return this.socket?.isPaused() ?? true;
  }
}
