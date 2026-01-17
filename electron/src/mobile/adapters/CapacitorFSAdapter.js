import { Filesystem } from '@capacitor/filesystem';
import { EventEmitter } from 'events';
class CapacitorFileHandle {
    path;
    offset = 0;
    buffer = Buffer.alloc(0);
    constructor(path) {
        this.path = path;
    }
    async write(data, offset, length, position) {
        this.offset = position;
        const writeData = data.slice(offset, offset + length);
        this.buffer = Buffer.concat([this.buffer, writeData]);
        try {
            const base64Data = this.buffer.toString('base64');
            await Filesystem.writeFile({
                path: this.path,
                data: base64Data,
                directory: 'Documents'
            });
            this.offset += writeData.length;
            return { bytesWritten: writeData.length, buffer: data };
        }
        catch (err) {
            throw new Error(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async close() {
        this.buffer = Buffer.alloc(0);
    }
}
class CapacitorWritable extends EventEmitter {
    path;
    chunks = [];
    totalSize = 0;
    _drainCallbacks = [];
    constructor(path) {
        super();
        this.path = path;
        console.log(`[CapacitorWritable] Created for path: ${path}`);
    }
    write(chunk, _encoding, callback) {
        console.log(`[CapacitorWritable] write called, chunks: ${this.chunks.length}, totalSize: ${this.totalSize}`);
        const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        this.chunks.push(buffer);
        this.totalSize += buffer.length;
        callback?.();
        // Always return true to indicate no backpressure (Capacitor Filesystem writes are async but buffered)
        return true;
    }
    once(event, callback) {
        console.log(`[CapacitorWritable] once called for event: ${event}`);
        if (event === 'drain') {
            // Store drain callbacks, they will be called immediately since we don't have backpressure
            this._drainCallbacks.push(callback);
            // Call immediately since we never have backpressure
            setImmediate(() => {
                const index = this._drainCallbacks.indexOf(callback);
                if (index !== -1) {
                    this._drainCallbacks.splice(index, 1);
                    callback();
                }
            });
        }
        else {
            super.once(event, callback);
        }
        return this;
    }
    async end(callback) {
        console.log(`[CapacitorWritable] end called, chunks: ${this.chunks.length}`);
        try {
            if (this.chunks.length === 0) {
                console.log('[CapacitorWritable] No chunks to write');
                callback?.();
                return;
            }
            const combined = Buffer.concat(this.chunks, this.totalSize);
            const base64Data = combined.toString('base64');
            console.log(`[CapacitorWritable] Writing ${combined.length} bytes to ${this.path}`);
            await Filesystem.writeFile({
                path: this.path,
                data: base64Data,
                directory: 'Documents'
            });
            console.log(`[CapacitorWritable] File written successfully`);
            callback?.();
        }
        catch (err) {
            console.error('[CapacitorWritable] Error in end:', err);
            const error = err instanceof Error ? err : new Error(String(err));
            callback?.(error);
        }
        finally {
            this.chunks = [];
            this.totalSize = 0;
        }
    }
}
export class CapacitorFSAdapter {
    baseDirectory = 'Documents'; // Use string literal directly
    writeStream(path) {
        const cleanPath = this.sanitizePath(path);
        console.log(`[CapacitorFSAdapter] writeStream called for path: ${path}`);
        console.log(`[CapacitorFSAdapter] Sanitized path: ${cleanPath}`);
        const writable = new CapacitorWritable(cleanPath);
        console.log(`[CapacitorFSAdapter] Created CapacitorWritable instance`);
        return writable;
    }
    async readFile(path) {
        const cleanPath = this.sanitizePath(path);
        try {
            const result = await Filesystem.readFile({
                path: cleanPath,
                directory: this.baseDirectory
            });
            if (result.data) {
                if (typeof result.data === 'string') {
                    return Buffer.from(result.data, 'base64');
                }
                else {
                    const blob = result.data;
                    const arrayBuffer = await blob.arrayBuffer();
                    return Buffer.from(arrayBuffer);
                }
            }
            throw new Error('No data returned from readFile');
        }
        catch (err) {
            throw new Error(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async exists(path) {
        const cleanPath = this.sanitizePath(path);
        try {
            await Filesystem.stat({
                path: cleanPath,
                directory: this.baseDirectory
            });
            return true;
        }
        catch {
            return false;
        }
    }
    async mkdir(path) {
        const cleanPath = this.sanitizePath(path);
        console.log(`[CapacitorFSAdapter] mkdir called with path: ${path}`);
        console.log(`[CapacitorFSAdapter] Sanitized path: ${cleanPath}`);
        console.log(`[CapacitorFSAdapter] Base directory: ${this.baseDirectory}`);
        try {
            const exists = await this.exists(path);
            if (exists) {
                console.log(`[CapacitorFSAdapter] Directory already exists: ${cleanPath}`);
                return;
            }
            console.log(`[CapacitorFSAdapter] Attempting to create directory with Capacitor: ${cleanPath}`);
            await Filesystem.mkdir({
                path: cleanPath,
                directory: this.baseDirectory,
                recursive: true
            });
            console.log(`[CapacitorFSAdapter] Directory created successfully: ${cleanPath}`);
        }
        catch (err) {
            console.error('[CapacitorFSAdapter] mkdir error:', err);
            console.error('[CapacitorFSAdapter] Error details:', {
                message: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : 'N/A'
            });
            if (!(err instanceof Error && err.message.includes('exists'))) {
                throw new Error(`Failed to create directory: ${cleanPath} - ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    async unlink(path) {
        const cleanPath = this.sanitizePath(path);
        try {
            await Filesystem.deleteFile({
                path: cleanPath,
                directory: this.baseDirectory
            });
        }
        catch (err) {
            throw new Error(`Failed to delete file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async writeFile(path, data) {
        const cleanPath = this.sanitizePath(path);
        console.log(`[CapacitorFSAdapter] Writing file: ${cleanPath}, base directory: ${this.baseDirectory}`);
        const buffer = data instanceof Buffer ? data : Buffer.from(data);
        const base64Data = buffer.toString('base64');
        try {
            await Filesystem.writeFile({
                path: cleanPath,
                data: base64Data,
                directory: this.baseDirectory,
                recursive: true
            });
        }
        catch (err) {
            throw new Error(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async open(_path, _flags) {
        const cleanPath = this.sanitizePath(_path);
        return new CapacitorFileHandle(cleanPath);
    }
    async readdir(path) {
        const cleanPath = this.sanitizePath(path);
        try {
            const result = await Filesystem.readdir({
                path: cleanPath,
                directory: this.baseDirectory
            });
            const items = [];
            for (const entry of result.files || []) {
                const name = typeof entry === 'string' ? entry : entry.name;
                try {
                    const statResult = await Filesystem.stat({
                        path: cleanPath ? `${cleanPath}/${name}` : name,
                        directory: this.baseDirectory
                    });
                    items.push({
                        name,
                        type: statResult.type === 'directory' ? 'directory' : 'file'
                    });
                }
                catch {
                    items.push({
                        name,
                        type: 'file'
                    });
                }
            }
            return items;
        }
        catch (err) {
            return [];
        }
    }
    sanitizePath(path) {
        const trimmed = path.trim();
        if (trimmed.startsWith('/')) {
            return trimmed.substring(1);
        }
        return trimmed;
    }
}
