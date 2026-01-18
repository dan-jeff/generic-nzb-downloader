import { IFileSystem, FileHandle } from '../../core/interfaces/IFileSystem.js';
import { Filesystem } from '@capacitor/filesystem';
import { EventEmitter } from 'events';

class CapacitorFileHandle implements FileHandle {
  private path: string;
  private offset: number = 0;
  private firstWrite: boolean = true;

  constructor(path: string) {
    this.path = path;
  }

  async write(data: Buffer, offset: number, length: number, position: number): Promise<{ bytesWritten: number; buffer: Buffer }> {
    this.offset = position;
    
    const writeData = data.slice(offset, offset + length);
    
    try {
      const base64Data = writeData.toString('base64');
      
      if (this.firstWrite) {
        // First write: overwrite/create the file
        // We use recursive: true to create parent directories if they don't exist
        await Filesystem.writeFile({
          path: this.path,
          data: base64Data,
          directory: 'Documents' as any,
          recursive: true
        });
        this.firstWrite = false;
      } else {
        // Subsequent writes: append to the file
        // This avoids loading the entire file into memory
        await Filesystem.appendFile({
          path: this.path,
          data: base64Data,
          directory: 'Documents' as any
        });
      }
      
      this.offset += writeData.length;
      return { bytesWritten: writeData.length, buffer: data };
    } catch (err) {
      throw new Error(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async close(): Promise<void> {
    // No buffering to clean up
  }
}

interface WriteCallback {
  (error?: Error | null): void;
}

class CapacitorWritable extends EventEmitter {
  private path: string;
  private firstWrite: boolean = true;
  private isWriting: boolean = false;
  private writeQueue: Buffer[] = [];
  private pendingCallback: (() => void) | null = null;

  constructor(path: string) {
    super();
    this.path = path;
    console.log(`[CapacitorWritable] Created for path: ${path}`);
  }

  write(chunk: any, _encoding?: BufferEncoding | string, callback?: (error?: Error | null) => void): boolean {
    const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
    this.writeQueue.push(buffer);
    
    // Process queue immediately
    this.processQueue().catch(err => {
      console.error('[CapacitorWritable] Error processing queue:', err);
      if (callback) callback(err instanceof Error ? err : new Error(String(err)));
      else this.emit('error', err);
    });

    if (callback) {
      // We can't call callback immediately if we want to simulate backpressure,
      // but Capacitor writes are async. We'll call it after scheduling.
      // Ideally we should wait for actual write, but for speed we might not?
      // Let's call it after successful write in processQueue logic?
      // For now, simpler: call it asynchronously to unblock stream
      setImmediate(callback);
    }
    
    return true;
  }

  private async processQueue() {
    if (this.isWriting) return;
    this.isWriting = true;

    try {
      while (this.writeQueue.length > 0) {
        const buffer = this.writeQueue.shift();
        if (!buffer) continue;

        const base64Data = buffer.toString('base64');

        if (this.firstWrite) {
          await Filesystem.writeFile({
            path: this.path,
            data: base64Data,
            directory: 'Documents' as any,
            recursive: true
          });
          this.firstWrite = false;
        } else {
          await Filesystem.appendFile({
            path: this.path,
            data: base64Data,
            directory: 'Documents' as any
          });
        }
      }
    } catch (err) {
      console.error('[CapacitorWritable] Write error:', err);
      this.emit('error', err);
    } finally {
      this.isWriting = false;
      // If queue received new items while we were writing, process them
      if (this.writeQueue.length > 0) {
        this.processQueue();
      } else if (this.pendingCallback) {
        this.pendingCallback();
        this.pendingCallback = null;
      }
    }
  }

  once(event: string, callback: (...args: any[]) => void): this {
    if (event === 'drain') {
       // We basically always drain immediately as we return true in write
       setImmediate(() => callback());
    } else {
       super.once(event, callback);
    }
    return this;
  }

  async end(callback?: WriteCallback): Promise<void> {
    console.log(`[CapacitorWritable] end called`);
    
    if (this.isWriting || this.writeQueue.length > 0) {
      // Wait for queue to drain
      await new Promise<void>((resolve) => {
        this.pendingCallback = resolve;
        if (!this.isWriting) this.processQueue(); // trigger if idle
      });
    }

    if (callback) callback();
    this.emit('finish');
  }
}

export class CapacitorFSAdapter implements IFileSystem {
  private baseDirectory = 'Documents';  // Use string literal directly

  writeStream(path: string): any {
    const cleanPath = this.sanitizePath(path);
    console.log(`[CapacitorFSAdapter] writeStream called for path: ${path}`);
    console.log(`[CapacitorFSAdapter] Sanitized path: ${cleanPath}`);
    const writable = new CapacitorWritable(cleanPath);
    console.log(`[CapacitorFSAdapter] Created CapacitorWritable instance`);
    return writable;
  }

  async readFile(path: string): Promise<Buffer> {
    const cleanPath = this.sanitizePath(path);
    
    try {
      const result = await Filesystem.readFile({
        path: cleanPath,
        directory: this.baseDirectory as any
      });

      if (result.data) {
        if (typeof result.data === 'string') {
          return Buffer.from(result.data, 'base64');
        } else {
          const blob = result.data as Blob;
          const arrayBuffer = await blob.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      }
      
      throw new Error('No data returned from readFile');
    } catch (err) {
      throw new Error(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async exists(path: string): Promise<boolean> {
    const cleanPath = this.sanitizePath(path);
    
    try {
      await Filesystem.stat({
        path: cleanPath,
        directory: this.baseDirectory as any
      });
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
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
        directory: this.baseDirectory as any,
        recursive: true
      });
      console.log(`[CapacitorFSAdapter] Directory created successfully: ${cleanPath}`);
    } catch (err) {
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

  async unlink(path: string): Promise<void> {
    const cleanPath = this.sanitizePath(path);
    
    try {
      await Filesystem.deleteFile({
        path: cleanPath,
        directory: this.baseDirectory as any
      });
    } catch (err) {
      throw new Error(`Failed to delete file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    const cleanPath = this.sanitizePath(path);
    console.log(`[CapacitorFSAdapter] Writing file: ${cleanPath}, base directory: ${this.baseDirectory}`);
    
    const buffer = data instanceof Buffer ? data : Buffer.from(data);
    const base64Data = buffer.toString('base64');

    try {
      await Filesystem.writeFile({
        path: cleanPath,
        data: base64Data,
        directory: this.baseDirectory as any,
        recursive: true
      });
    } catch (err) {
      throw new Error(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async open(_path: string, _flags: string): Promise<FileHandle> {
    const cleanPath = this.sanitizePath(_path);
    return new CapacitorFileHandle(cleanPath);
  }

  async readdir(path: string): Promise<{ name: string; type: 'file' | 'directory' }[]> {
    const cleanPath = this.sanitizePath(path);
    
    try {
      const result = await Filesystem.readdir({
        path: cleanPath,
        directory: this.baseDirectory as any
      });

      const items: { name: string; type: 'file' | 'directory' }[] = [];

      for (const entry of result.files || []) {
        const name = typeof entry === 'string' ? entry : entry.name;
        
        try {
          const statResult = await Filesystem.stat({
            path: cleanPath ? `${cleanPath}/${name}` : name,
            directory: this.baseDirectory as any
          });

          items.push({
            name,
            type: statResult.type === 'directory' ? 'directory' : 'file'
          });
        } catch {
          items.push({
            name,
            type: 'file'
          });
        }
      }

      return items;
    } catch (err) {
      return [];
    }
  }

  private sanitizePath(path: string): string {
    const trimmed = path.trim();
    if (trimmed.startsWith('/')) {
      return trimmed.substring(1);
    }
    return trimmed;
  }
}
