import { EventEmitter } from 'events';
import { Buffer } from 'buffer';
import { registerPlugin } from '@capacitor/core';
import { INetwork } from '../../core/interfaces/INetwork.js';

const TlsSocketPlugin = registerPlugin<any>('TlsSocketPlugin');

export class TlsNetworkAdapter extends EventEmitter implements INetwork {
  private dataListenerHandle: any = null;
  private closeListenerHandle: any = null;
  private errorListenerHandle: any = null;
  private listenersRegistered: boolean = false;
  private destroyedValue: boolean = false;
  private pausedValue: boolean = false;
  private isConnectedValue: boolean = false;

  constructor() {
    super();
    console.log('[TlsNetworkAdapter] Created');
    this.setupListeners();
  }

  private setupListeners(): void {
    if (this.listenersRegistered) {
      return;
    }

    try {
      console.log('[TlsNetworkAdapter] Setting up event listeners');
      
      this.dataListenerHandle = TlsSocketPlugin.addListener('data', (info: any) => {
        console.log('[TlsNetworkAdapter] Received data event, length:', info.data?.length);
        if (info.data) {
          const buffer = Buffer.from(info.data, 'base64');
          this.emit('data', buffer);
        }
      });
      
      this.closeListenerHandle = TlsSocketPlugin.addListener('close', () => {
        console.log('[TlsNetworkAdapter] Received close event');
        this.emit('close');
      });
      
      this.errorListenerHandle = TlsSocketPlugin.addListener('error', (err: any) => {
        console.log('[TlsNetworkAdapter] Received error event:', err);
        this.emit('error', new Error(err.message || err.error || 'Socket error'));
      });

      this.listenersRegistered = true;
      console.log('[TlsNetworkAdapter] Event listeners registered successfully');
    } catch (e) {
      console.error('[TlsNetworkAdapter] Error registering listeners:', e);
      // Don't throw - allow connection to proceed
    }
  }

  async connect(hostname: string, port: number, useSSL: boolean): Promise<void> {
    console.log(`[TlsNetworkAdapter] connect called: ${hostname}:${port}, SSL: ${useSSL}`);
    
    // Ensure listeners are set up
    this.setupListeners();

    return new Promise((resolve, reject) => {
      console.log('[TlsNetworkAdapter] Calling TlsSocketPlugin.connect()');
      
      // Set a timeout in case the callback never fires
      const timeoutId = setTimeout(() => {
        console.error('[TlsNetworkAdapter] Connection timeout - callback never fired after 35 seconds');
        this.destroyedValue = true;
        const error = new Error('TLS connection timeout - plugin callback not invoked');
        this.emit('error', error);
        reject(error);
      }, 35000);

      try {
        TlsSocketPlugin.connect({
          host: hostname,
          port: port,
          useSSL: useSSL
        }).then((ret: any) => {
          clearTimeout(timeoutId);
          console.log('[TlsNetworkAdapter] TlsSocketPlugin.connect() promise resolved:', JSON.stringify(ret));
          if (ret.success) {
            this.isConnectedValue = true;
            this.destroyedValue = false;
            console.log('[TlsNetworkAdapter] Connected successfully via TLS plugin');
            this.emit('connect');
            resolve();
          } else {
            const errorMsg = ret.error || 'Connection failed';
            console.error('[TlsNetworkAdapter] Connection failed:', errorMsg);
            this.destroyedValue = true;
            this.emit('error', new Error(errorMsg));
            reject(new Error(errorMsg));
          }
        }).catch((err: any) => {
          clearTimeout(timeoutId);
          console.error('[TlsNetworkAdapter] TlsSocketPlugin.connect() promise rejected:', err);
          const errorMsg = err.message || err.error || String(err);
          this.destroyedValue = true;
          this.emit('error', new Error(errorMsg));
          reject(new Error(errorMsg));
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('[TlsNetworkAdapter] Exception calling TlsSocketPlugin.connect():', err);
        const errorMsg = err.message || String(err);
        this.destroyedValue = true;
        this.emit('error', new Error(errorMsg));
        reject(new Error(errorMsg));
      }
    });
  }

  write(data: string, _encoding: BufferEncoding, callback?: (err?: Error | null) => void): boolean {
    console.log(`[TlsNetworkAdapter] write called, length: ${data.length}`);
    
    if (!this.isConnectedValue) {
      console.error('[TlsNetworkAdapter] Not connected, cannot write');
      callback?.(new Error('Socket not connected'));
      return false;
    }

    TlsSocketPlugin.write({
      data: data
    }).then((ret: any) => {
      console.log('[TlsNetworkAdapter] write() result:', ret);
      if (callback) {
        callback(ret.success ? null : new Error(ret.error || 'Write failed'));
      }
    }).catch((err: any) => {
      console.error('[TlsNetworkAdapter] write() error:', err);
      if (callback) {
        callback(new Error(err.message || err.error || 'Write failed'));
      }
    });

    return true;
  }

  pause(): void {
    console.log('[TlsNetworkAdapter] pause called');
    this.pausedValue = true;
  }

  resume(): void {
    console.log('[TlsNetworkAdapter] resume called');
    this.pausedValue = false;
  }

  end(): void {
    console.log('[TlsNetworkAdapter] end called');
    this.disconnect();
  }

  destroy(): void {
    console.log('[TlsNetworkAdapter] destroy called');
    this.destroyedValue = true;
    this.disconnect();
  }

  private disconnect(): void {
    console.log('[TlsNetworkAdapter] disconnect() called, isConnected:', this.isConnectedValue);
    
    if (!this.isConnectedValue) {
      console.log('[TlsNetworkAdapter] Not connected, skipping disconnect');
      return;
    }

    this.isConnectedValue = false;
    
    console.log('[TlsNetworkAdapter] Calling TlsSocketPlugin.disconnect()');
    TlsSocketPlugin.disconnect()
      .then((ret: any) => {
        console.log('[TlsNetworkAdapter] disconnect() result:', ret);
      })
      .catch((err: any) => {
        console.error('[TlsNetworkAdapter] Error during disconnect:', err);
      });
    console.log('[TlsNetworkAdapter] Disconnected from plugin');

    this.emit('close', this.destroyedValue);
  }

  cleanup(): void {
    console.log('[TlsNetworkAdapter] cleanup() called');
    if (this.dataListenerHandle) {
      this.dataListenerHandle.remove();
      this.dataListenerHandle = null;
    }
    if (this.closeListenerHandle) {
      this.closeListenerHandle.remove();
      this.closeListenerHandle = null;
    }
    if (this.errorListenerHandle) {
      this.errorListenerHandle.remove();
      this.errorListenerHandle = null;
    }
    this.listenersRegistered = false;
  }

  get destroyed(): boolean {
    return this.destroyedValue;
  }

  isPaused(): boolean {
    return this.pausedValue;
  }
}
