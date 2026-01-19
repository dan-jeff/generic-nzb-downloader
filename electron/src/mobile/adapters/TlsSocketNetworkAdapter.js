import { EventEmitter } from 'events';
import TlsSocket from '../plugins/TlsSocketPlugin.js';
/**
 * Network adapter using custom TlsSocketPlugin (native Android SSLSocket)
 * This should provide reliable TLS communication on Android
 */
export class TlsSocketNetworkAdapter extends EventEmitter {
    isConnected = false;
    destroyed = false;
    paused = false;
    readBuffer = [];
    pluginListeners = [];
    constructor() {
        super();
        console.log('[TlsSocketNetworkAdapter] Created');
    }
    async connect(host, port, useSSL) {
        console.log(`[TlsSocketNetworkAdapter] connect called: ${host}:${port}, SSL: ${useSSL}`);
        // Set up event listeners BEFORE connecting
        const dataListener = await TlsSocket.addListener('data', (event) => {
            console.log(`[TlsSocketNetworkAdapter] Received data event, base64 length: ${event.data.length}`);
            // Decode base64 to Buffer
            const buffer = Buffer.from(event.data, 'base64');
            console.log(`[TlsSocketNetworkAdapter] Decoded ${buffer.length} bytes`);
            // console.log(`[TlsSocketNetworkAdapter] First bytes (hex): ${buffer.slice(0, Math.min(20, buffer.length)).toString('hex')}`);
            // console.log(`[TlsSocketNetworkAdapter] As string: ${buffer.toString('utf8', 0, Math.min(50, buffer.length))}`);
            if (!this.paused) {
                this.emit('data', buffer);
            }
            else {
                this.readBuffer.push(buffer);
            }
        });
        this.pluginListeners.push(dataListener);
        const errorListener = await TlsSocket.addListener('error', (event) => {
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
    write(data, encoding, callback) {
        if (!this.isConnected) {
            const error = new Error('Socket not connected');
            if (callback)
                callback(error);
            return false;
        }
        const str = typeof data === 'string' ? data : data.toString(encoding || 'utf-8');
        console.log(`[TlsSocketNetworkAdapter] Writing ${str.length} chars`);
        TlsSocket.write({ data: str })
            .then((result) => {
            if (!result.success) {
                const error = new Error(result.error || 'Write failed');
                console.error('[TlsSocketNetworkAdapter]', error.message);
                if (callback)
                    callback(error);
            }
            else {
                console.log('[TlsSocketNetworkAdapter] Write successful');
                if (callback)
                    callback(null);
            }
        })
            .catch((error) => {
            console.error('[TlsSocketNetworkAdapter] Write error:', error);
            if (callback)
                callback(error);
        });
        return true;
    }
    end() {
        console.log('[TlsSocketNetworkAdapter] end() called');
        this.destroy();
    }
    destroy() {
        console.log('[TlsSocketNetworkAdapter] destroy() called');
        if (this.destroyed)
            return;
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
    pause() {
        console.log('[TlsSocketNetworkAdapter] pause() called');
        if (this.paused)
            return;
        this.paused = true;
        TlsSocket.pause()
            .then(() => console.log('[TlsSocketNetworkAdapter] Native socket paused'))
            .catch(err => console.error('[TlsSocketNetworkAdapter] Failed to pause native socket:', err));
    }
    resume() {
        console.log('[TlsSocketNetworkAdapter] resume() called');
        if (!this.paused)
            return;
        this.paused = false;
        // Emit any buffered data first (legacy support)
        while (this.readBuffer.length > 0) {
            const buffer = this.readBuffer.shift();
            this.emit('data', buffer);
        }
        TlsSocket.resume()
            .then(() => console.log('[TlsSocketNetworkAdapter] Native socket resumed'))
            .catch(err => console.error('[TlsSocketNetworkAdapter] Failed to resume native socket:', err));
    }
    isPaused() {
        return this.paused;
    }
    on(event, listener) {
        super.on(event, listener);
        return this;
    }
    once(event, listener) {
        super.once(event, listener);
        return this;
    }
}
