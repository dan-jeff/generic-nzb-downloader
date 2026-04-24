import { WebPlugin } from '@capacitor/core';
const WEB_UNAVAILABLE_ERROR = 'TLS socket not supported on web — use SABnzbd or NZBget, or run this feature in Electron / Android.';
const notifyWebUnavailable = (method, detail) => {
    if (typeof window === 'undefined')
        return;
    window.dispatchEvent(new CustomEvent('tls-socket-web-unavailable', { detail: { method, detail } }));
};
export class TlsSocketPluginWeb extends WebPlugin {
    async connect(options) {
        console.log('TlsSocketPlugin not available on web', options);
        notifyWebUnavailable('connect', options);
        return { success: false, error: WEB_UNAVAILABLE_ERROR };
    }
    async write(options) {
        console.log('TlsSocketPlugin not available on web', options);
        return { success: false, error: WEB_UNAVAILABLE_ERROR };
    }
    async disconnect() {
        console.log('TlsSocketPlugin not available on web');
        return { success: false, error: WEB_UNAVAILABLE_ERROR };
    }
    async pause() {
        console.log('TlsSocketPlugin not available on web');
        return { success: false };
    }
    async resume() {
        console.log('TlsSocketPlugin not available on web');
        return { success: false };
    }
}
