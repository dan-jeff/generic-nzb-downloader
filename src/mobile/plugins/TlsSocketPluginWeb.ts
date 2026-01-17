import { WebPlugin } from '@capacitor/core';
import type { TlsSocketPlugin } from './TlsSocketPlugin.js';

export class TlsSocketPluginWeb extends WebPlugin implements TlsSocketPlugin {
  async connect(options: { host: string; port: number; useSSL: boolean }): Promise<{ success: boolean; error?: string }> {
    console.log('TlsSocketPlugin not available on web', options);
    return { success: false, error: 'TLS socket not supported on web' };
  }

  async write(options: { data: string }): Promise<{ success: boolean; error?: string }> {
    console.log('TlsSocketPlugin not available on web', options);
    return { success: false, error: 'TLS socket not supported on web' };
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    console.log('TlsSocketPlugin not available on web');
    return { success: false, error: 'TLS socket not supported on web' };
  }
}
