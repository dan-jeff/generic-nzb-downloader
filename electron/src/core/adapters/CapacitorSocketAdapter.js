import { EventEmitter } from 'events';
export class CapacitorSocketAdapter extends EventEmitter {
    socketId = null;
    destroyedValue = false;
    pausedValue = false;
    writeCallbacks = [];
    constructor() {
        super();
    }
    async connect(hostname, port, useSSL) {
        if (useSSL) {
            throw new Error('SSL not yet supported for Capacitor socket adapter');
        }
        if (typeof window === 'undefined' || !window.chrome?.sockets?.tcp) {
            throw new Error('chrome.sockets.tcp not available');
        }
        return new Promise((resolve, reject) => {
            window.chrome.sockets.tcp.create({ persistent: false, name: 'nntp' }, (socketInfo) => {
                if (window.chrome.runtime?.lastError) {
                    reject(new Error(`Failed to create socket: ${window.chrome.runtime.lastError.message}`));
                    return;
                }
                this.socketId = socketInfo.socketId;
                window.chrome.sockets.tcp.connect(this.socketId, { host: hostname, port: port }, () => {
                    if (window.chrome.runtime?.lastError) {
                        this.cleanup();
                        reject(new Error(`Connection failed: ${window.chrome.runtime?.lastError.message}`));
                        return;
                    }
                    this.setupEventListeners();
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
    write(data, encoding, callback) {
        if (this.socketId === null || typeof window === 'undefined' || !window.chrome?.sockets?.tcp) {
            callback?.(new Error('Socket not available'));
            return false;
        }
        const encoder = new TextEncoder();
        const buffer = encoder.encode(data);
        window.chrome.sockets.tcp.send(this.socketId, buffer.buffer, (sendInfo) => {
            if (window.chrome.runtime?.lastError || sendInfo.resultCode < 0) {
                const err = new Error(`Send failed: ${window.chrome.runtime?.lastError?.message || sendInfo.resultCode}`);
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
