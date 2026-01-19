import { registerPlugin } from '@capacitor/core';
const TlsSocket = registerPlugin('TlsSocketPlugin', {
    web: () => import('./TlsSocketPluginWeb.js').then((m) => new m.TlsSocketPluginWeb()),
});
export default TlsSocket;
