import { WebPlugin } from '@capacitor/core';
import type { TlsSocketPlugin } from './TlsSocketPlugin.js';

const WEB_UNAVAILABLE_ERROR = 'TLS socket not supported on web — use SABnzbd or NZBget, or run this feature in Electron / Android.';

const notifyWebUnavailable = (method: string, detail?: unknown) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('tls-socket-web-unavailable', { detail: { method, detail } }),
  );
};

export class TlsSocketPluginWeb extends WebPlugin implements TlsSocketPlugin {
  async connect(options: { host: string; port: number; useSSL: boolean }): Promise<{ success: boolean; error?: string }> {
    console.log('TlsSocketPlugin not available on web', options);
    notifyWebUnavailable('connect', options);
    return { success: false, error: WEB_UNAVAILABLE_ERROR };
  }

  async write(options: { data: string }): Promise<{ success: boolean; error?: string }> {
    console.log('TlsSocketPlugin not available on web', options);
    return { success: false, error: WEB_UNAVAILABLE_ERROR };
  }

  async disconnect(): Promise<{ success: boolean; error?: string }> {
    console.log('TlsSocketPlugin not available on web');
    return { success: false, error: WEB_UNAVAILABLE_ERROR };
  }

  async pause(): Promise<{ success: boolean }> {
    console.log('TlsSocketPlugin not available on web');
    return { success: false };
  }

  async resume(): Promise<{ success: boolean }> {
    console.log('TlsSocketPlugin not available on web');
    return { success: false };
  }
}
