import { EventEmitter } from 'events';
import * as net from 'net';
import * as tls from 'tls';
export class NodeNetworkAdapter extends EventEmitter {
    socket = null;
    destroyedValue = false;
    async connect(hostname, port, useSSL) {
        return new Promise((resolve, reject) => {
            try {
                if (useSSL) {
                    this.socket = tls.connect({
                        host: hostname,
                        port: port,
                        rejectUnauthorized: false
                    });
                }
                else {
                    this.socket = net.connect({
                        host: hostname,
                        port: port
                    });
                }
                this.socket.on('connect', () => {
                    this.emit('connect');
                    resolve();
                });
                this.socket.on('data', (data) => {
                    this.emit('data', data);
                });
                this.socket.on('error', (err) => {
                    this.emit('error', err);
                });
                this.socket.on('close', (hadError) => {
                    this.destroyedValue = true;
                    this.emit('close', hadError);
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
    write(data, encoding, callback) {
        if (!this.socket) {
            return false;
        }
        return this.socket.write(data, encoding, callback);
    }
    pause() {
        this.socket?.pause();
    }
    resume() {
        this.socket?.resume();
    }
    end() {
        this.socket?.end();
    }
    destroy() {
        if (this.socket && !this.destroyedValue) {
            this.socket.destroy();
        }
        this.destroyedValue = true;
    }
    get destroyed() {
        return this.destroyedValue || (this.socket?.destroyed ?? true);
    }
    isPaused() {
        return this.socket?.isPaused() ?? true;
    }
}
