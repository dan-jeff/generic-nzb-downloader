import { registerPlugin } from '@capacitor/core';

export interface TlsSocketPlugin {
  connect(options: { host: string; port: number; useSSL: boolean }): Promise<{ success: boolean; error?: string }>;
  write(options: { data: string }): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<{ success: boolean; error?: string }>;
  addListener(eventName: 'data', listenerFunc: (event: { data: string }) => void): Promise<any>;
  addListener(eventName: 'error', listenerFunc: (event: { error: string }) => void): Promise<any>;
  addListener(eventName: 'close', listenerFunc: () => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

const TlsSocket = registerPlugin<TlsSocketPlugin>('TlsSocketPlugin', {
  web: () => import('./TlsSocketPluginWeb.js').then((m) => new m.TlsSocketPluginWeb()),
});

export default TlsSocket;
