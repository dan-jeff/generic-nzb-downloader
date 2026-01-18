import { EventEmitter } from 'events';
import { INetwork } from '@core/interfaces/INetwork.js';
import TlsSocket from '../plugins/TlsSocketPlugin.js';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Network adapter using custom TlsSocketPlugin (native Android SSLSocket)
 * This should provide reliable TLS communication on Android
 */
export class TlsSocketNetworkAdapter extends EventEmitter implements INetwork {
  private isConnected: boolean = false;
  public destroyed: boolean = false;
  private paused: boolean = false;
  private readBuffer: Buffer[] = [];
  private pluginListeners: PluginListenerHandle[] = [];

  constructor() {
    super();
    console.log('[TlsSocketNetworkAdapter] Created');
  }

  async connect(host: string, port: number, useSSL: boolean): Promise<void> {
    console.log(`[TlsSocketNetworkAdapter] connect called: ${host}:${port}, SSL: ${useSSL}`);
    
    // Set up event listeners BEFORE connecting
    const dataListener = await TlsSocket.addListener('data', (event: { data: string }) => {
      console.log(`[TlsSocketNetworkAdapter] Received data event, base64 length: ${event.data.length}`);
      
      // Decode base64 to Buffer
      const buffer = Buffer.from(event.data, 'base64');
      console.log(`[TlsSocketNetworkAdapter] Decoded ${buffer.length} bytes`);
      // console.log(`[TlsSocketNetworkAdapter] First bytes (hex): ${buffer.slice(0, Math.min(20, buffer.length)).toString('hex')}`);
      // console.log(`[TlsSocketNetworkAdapter] As string: ${buffer.toString('utf8', 0, Math.min(50, buffer.length))}`);
      
      if (!this.paused) {
        this.emit('data', buffer);
      } else {
        this.readBuffer.push(buffer);
      }
    });
    this.pluginListeners.push(dataListener);

    const errorListener = await TlsSocket.addListener('error', (event: { error: string }) => {
      console.error('[TlsSocketNetworkAdapter] Error event:', event.error);
      this.emit('error', new Error(event.error));
    });
    this.pluginListeners.push(errorListener);

    const closeListener = await TlsSocket.addListener('close', () => {
      console.log('[TlsSocketNetworkAdapter] Close event');
      this.isConnected = false;
      this.emit('close', false);
    });
    this.pluginListeners.push(closeListener);

    // Now connect
    console.log('[TlsSocketNetworkAdapter] Calling native connect...');
    const result = await TlsSocket.connect({ host, port, useSSL });
    
    if (!result.success) {
      console.error('[TlsSocketNetworkAdapter] Connection failed:', result.error);
      throw new Error(result.error || 'Connection failed');
    }

    console.log('[TlsSocketNetworkAdapter] Connection successful');
    this.isConnected = true;
    this.emit('connect');
  }

  write(data: string | Buffer, encoding?: BufferEncoding, callback?: (error?: Error | null) => void): boolean {
    if (!this.isConnected) {
      const error = new Error('Socket not connected');
      if (callback) callback(error);
      return false;
    }

    const str = typeof data === 'string' ? data : data.toString(encoding || 'utf-8');
    console.log(`[TlsSocketNetworkAdapter] Writing ${str.length} chars`);
    
    TlsSocket.write({ data: str })
      .then((result) => {
        if (!result.success) {
          const error = new Error(result.error || 'Write failed');
          console.error('[TlsSocketNetworkAdapter]', error.message);
          if (callback) callback(error);
        } else {
          console.log('[TlsSocketNetworkAdapter] Write successful');
          if (callback) callback(null);
        }
      })
      .catch((error) => {
        console.error('[TlsSocketNetworkAdapter] Write error:', error);
        if (callback) callback(error);
      });

    return true;
  }

  end(): void {
    console.log('[TlsSocketNetworkAdapter] end() called');
    this.destroy();
  }

  destroy(): void {
    console.log('[TlsSocketNetworkAdapter] destroy() called');
    if (this.destroyed) return;
    
    this.destroyed = true;
    this.isConnected = false;

    // Remove all event listeners
    for (const listener of this.pluginListeners) {
      listener.remove();
    }
    this.pluginListeners = [];

    // Disconnect socket
    TlsSocket.disconnect()
      .then(() => {
        console.log('[TlsSocketNetworkAdapter] Disconnected');
      })
      .catch((error) => {
        console.error('[TlsSocketNetworkAdapter] Disconnect error:', error);
      });

    this.emit('close', false);
  }

  pause(): void {
    console.log('[TlsSocketNetworkAdapter] pause() called');
    if (this.paused) return;
    this.paused = true;
    
    TlsSocket.pause()
      .then(() => console.log('[TlsSocketNetworkAdapter] Native socket paused'))
      .catch(err => console.error('[TlsSocketNetworkAdapter] Failed to pause native socket:', err));
  }

  resume(): void {
    console.log('[TlsSocketNetworkAdapter] resume() called');
    if (!this.paused) return;
    this.paused = false;
    
    // Emit any buffered data first (legacy support)
    while (this.readBuffer.length > 0) {
      const buffer = this.readBuffer.shift()!;
      this.emit('data', buffer);
    }

    TlsSocket.resume()
      .then(() => console.log('[TlsSocketNetworkAdapter] Native socket resumed'))
      .catch(err => console.error('[TlsSocketNetworkAdapter] Failed to resume native socket:', err));
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
