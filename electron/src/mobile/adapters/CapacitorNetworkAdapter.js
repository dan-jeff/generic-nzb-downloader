import { EventEmitter } from 'events';
export class CapacitorNetworkAdapter extends EventEmitter {
    socketId = null;
    destroyedValue = false;
    pausedValue = false;
    constructor() {
        super();
    }
    async connect(hostname, port, useSSL) {
        console.log(`[CapacitorNetworkAdapter] connect called: ${hostname}:${port}, SSL: ${useSSL}`);
        if (useSSL) {
            console.error('[CapacitorNetworkAdapter] >>> SSL/TLS NOT SUPPORTED <<<');
            console.error('[CapacitorNetworkAdapter] Chrome sockets.tcp API does not support SSL/TLS natively');
            console.error('[CapacitorNetworkAdapter] Connection will fail - SSL not implemented');
            console.error('[CapacitorNetworkAdapter] Required: TLS socket implementation for Capacitor');
            // Don't throw here - let the connection fail naturally with clear error
            // This ensures the actual error gets logged properly
        }
        if (typeof window === 'undefined') {
            console.error('[CapacitorNetworkAdapter] >>> window IS UNDEFINED <<<');
            throw new Error('window is undefined');
        }
        if (!window.chrome?.sockets?.tcp) {
            console.error('[CapacitorNetworkAdapter] >>> CHROME SOCKETS.TCP NOT AVAILABLE <<<');
            console.error('[CapacitorNetworkAdapter] window.chrome:', !!window.chrome);
            console.error('[CapacitorNetworkAdapter] window.chrome.sockets:', !!window.chrome?.sockets);
            console.error('[CapacitorNetworkAdapter] window.chrome.sockets.tcp:', !!window.chrome?.sockets?.tcp);
            throw new Error('chrome.sockets.tcp not available');
        }
        console.log('[CapacitorNetworkAdapter] Attempting to create socket...');
        return new Promise((resolve, reject) => {
            window.chrome.sockets.tcp.create({ persistent: false, name: 'nntp' }, (socketInfo) => {
                console.log('[CapacitorNetworkAdapter] Socket create callback called:', socketInfo);
                const lastError = window.chrome?.runtime?.lastError;
                console.log('[CapacitorNetworkAdapter] Last error after socket create:', lastError);
                if (lastError) {
                    const errorMsg = `Failed to create socket: ${lastError.message || lastError}`;
                    console.error('[CapacitorNetworkAdapter]', errorMsg);
                    this.cleanup();
                    reject(new Error(errorMsg));
                    return;
                }
                this.socketId = socketInfo.socketId;
                console.log(`[CapacitorNetworkAdapter] Socket created with ID: ${this.socketId}`);
                console.log(`[CapacitorNetworkAdapter] Attempting to connect to ${hostname}:${port}...`);
                window.chrome.sockets.tcp.connect(this.socketId, { host: hostname, port: port }, () => {
                    console.log(`[CapacitorNetworkAdapter] Connect callback called for socket ${this.socketId}`);
                    const lastError = window.chrome?.runtime?.lastError;
                    console.log('[CapacitorNetworkAdapter] Last error after connect:', lastError);
                    if (lastError) {
                        const errorMsg = `Connection failed: ${lastError.message || lastError}`;
                        console.error('[CapacitorNetworkAdapter]', errorMsg);
                        this.cleanup();
                        reject(new Error(errorMsg));
                        return;
                    }
                    console.log('[CapacitorNetworkAdapter] Connection established, setting up event listeners');
                    this.setupEventListeners();
                    console.log('[CapacitorNetworkAdapter] Emitting connect event');
                    this.emit('connect');
                    resolve();
                });
            });
        });
    }
    setupEventListeners() {
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
    write(data, _encoding, callback) {
        if (this.socketId === null || typeof window === 'undefined' || !window.chrome?.sockets?.tcp) {
            callback?.(new Error('Socket not available'));
            return false;
        }
        const encoder = new TextEncoder();
        const buffer = encoder.encode(data);
        window.chrome.sockets.tcp.send(this.socketId, buffer.buffer, (sendInfo) => {
            const lastError = window.chrome?.runtime?.lastError;
            if (lastError || sendInfo.resultCode < 0) {
                const err = new Error(`Send failed: ${lastError?.message || sendInfo.resultCode}`);
                callback?.(err);
            }
            else {
                callback?.(null);
            }
        });
        return true;
    }
    pause() {
        if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
            window.chrome.sockets.tcp.setPaused(this.socketId, true, () => { });
        }
        this.pausedValue = true;
    }
    resume() {
        if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
            window.chrome.sockets.tcp.setPaused(this.socketId, false, () => { });
        }
        this.pausedValue = false;
    }
    end() {
        this.disconnectSocket();
    }
    destroy() {
        this.destroyedValue = true;
        this.cleanup();
    }
    disconnectSocket() {
        if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
            window.chrome.sockets.tcp.disconnect(this.socketId, () => { });
        }
    }
    cleanup() {
        this.disconnectSocket();
        if (this.socketId !== null && typeof window !== 'undefined' && window.chrome?.sockets?.tcp) {
            window.chrome.sockets.tcp.close(this.socketId, () => { });
            this.socketId = null;
        }
    }
    get destroyed() {
        return this.destroyedValue;
    }
    isPaused() {
        return this.pausedValue;
    }
}
