import { WebPlugin } from '@capacitor/core';
export class TlsSocketPluginWeb extends WebPlugin {
    async connect(options) {
        console.log('TlsSocketPlugin not available on web', options);
        return { success: false, error: 'TLS socket not supported on web' };
    }
    async write(options) {
        console.log('TlsSocketPlugin not available on web', options);
        return { success: false, error: 'TLS socket not supported on web' };
    }
    async disconnect() {
        console.log('TlsSocketPlugin not available on web');
        return { success: false, error: 'TLS socket not supported on web' };
    }
}
