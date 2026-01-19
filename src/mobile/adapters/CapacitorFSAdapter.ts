import { IFileSystem, FileHandle } from '../../core/interfaces/IFileSystem.js';
import { Directory, Filesystem } from '@capacitor/filesystem';

import { EventEmitter } from 'events';

class CapacitorFileHandle implements FileHandle {
  private path: string;
  private directory: Directory;
  private offset: number = 0;
  private firstWrite: boolean = true;

  constructor(path: string, directory: Directory) {
    this.path = path;
    this.directory = directory;
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
          directory: this.directory,
          recursive: true
        });
        this.firstWrite = false;
      } else {
        // Subsequent writes: append to the file
        // This avoids loading the entire file into memory
        await Filesystem.appendFile({
          path: this.path,
          data: base64Data,
          directory: this.directory
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
  private directory: Directory;
  private firstWrite: boolean = true;
  private isWriting: boolean = false;
  private pendingCallback: (() => void) | null = null;

  private writeBuffer: Buffer = Buffer.alloc(0);
  private flushTimer: NodeJS.Timeout | null = null;

  private static readonly FLUSH_THRESHOLD = 512 * 1024;  // 512KB - Increased for efficiency now that flow control works
  private static readonly FLUSH_TIMEOUT = 200;         // 200ms
  private static readonly HIGH_WATER_MARK = 1024 * 1024; // 1MB

  constructor(path: string, directory: Directory) {
    super();
    this.path = path;
    this.directory = directory;
    console.log(`[CapacitorWritable] Created for path: ${path}`);
  }

  write(chunk: any, _encoding?: BufferEncoding | string, callback?: (error?: Error | null) => void): boolean {
    const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);

    this.writeBuffer = Buffer.concat([this.writeBuffer, buffer]);

    const bufferSize = this.writeBuffer.length;
    const canAcceptMore = bufferSize < CapacitorWritable.HIGH_WATER_MARK;

    if (!canAcceptMore) {
      if (callback) {
        const wrappedCallback = callback;
        callback = () => {};
        this.pendingCallback = () => wrappedCallback();
      }
    }

    if (bufferSize >= CapacitorWritable.FLUSH_THRESHOLD && !this.isWriting) {
      this.flush().catch(err => {
        if (callback) callback(err instanceof Error ? err : new Error(String(err)));
      });
    } else {
      this.scheduleFlush();
    }

    if (callback && canAcceptMore) {
      setImmediate(callback);
    }

    return canAcceptMore;
  }

  private async flush(): Promise<void> {
    if (this.writeBuffer.length === 0) return;

    this.isWriting = true;
    const wasFull = this.writeBuffer.length >= CapacitorWritable.HIGH_WATER_MARK;

    try {
      const base64Data = this.writeBuffer.toString('base64');

      if (this.firstWrite) {
        await Filesystem.writeFile({
          path: this.path,
          data: base64Data,
          directory: this.directory,
          recursive: true
        });
        this.firstWrite = false;
      } else {
        await Filesystem.appendFile({
          path: this.path,
          data: base64Data,
          directory: this.directory
        });
      }

      this.writeBuffer = Buffer.alloc(0);

      if (wasFull) {
        this.emit('drain');
      }
    } catch (err) {
      this.emit('error', err);
      throw err;
    } finally {
      this.isWriting = false;

      if (this.pendingCallback) {
        this.pendingCallback();
        this.pendingCallback = null;
      }
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(async () => {
      try {
        await this.flush();
      } catch (err) {
        console.error('[CapacitorWritable] Scheduled flush error:', err);
      }
    }, CapacitorWritable.FLUSH_TIMEOUT);
  }

  once(event: string, callback: (...args: any[]) => void): this {
    if (event === 'drain') {
     super.once(event, callback);
    } else {
     super.once(event, callback);
    }
    return this;
  }

  async end(callback?: WriteCallback): Promise<void> {
    console.log(`[CapacitorWritable] end called`);

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.writeBuffer.length > 0) {
      if (this.isWriting) {
        await new Promise<void>((resolve) => {
          this.pendingCallback = resolve;
        });
      } else {
        await this.flush();
      }
    }

    if (callback) callback();
    this.emit('finish');
  }
}

export class CapacitorFSAdapter implements IFileSystem {
  private baseDirectory = Directory.ExternalStorage;

  writeStream(path: string): any {
    const cleanPath = this.sanitizePath(path);
    console.log(`[CapacitorFSAdapter] writeStream called for path: ${path}`);
    console.log(`[CapacitorFSAdapter] Sanitized path: ${cleanPath}`);
    const writable = new CapacitorWritable(cleanPath, this.baseDirectory);
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

    if (!cleanPath) return;

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
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('Missing parent directory')) {
        console.error('[CapacitorFSAdapter] mkdir error:', err);
        throw new Error(`Failed to create directory: ${cleanPath} - ${message}`);
      }

      console.warn('[CapacitorFSAdapter] Recursive mkdir failed, retrying stepwise.');
      const parts = cleanPath.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        try {
          const currentExists = await this.exists(current);
          if (!currentExists) {
            await Filesystem.mkdir({
              path: current,
              directory: this.baseDirectory as any,
              recursive: false
            });
          }
        } catch (innerErr) {
          const innerMessage = innerErr instanceof Error ? innerErr.message : String(innerErr);
          if (!innerMessage.includes('exists')) {
            throw new Error(`Failed to create directory: ${current} - ${innerMessage}`);
          }
        }
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
        directory: this.baseDirectory,
        recursive: true
      });
    } catch (err) {
      throw new Error(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async open(_path: string, _flags: string): Promise<FileHandle> {
    const cleanPath = this.sanitizePath(_path);
    return new CapacitorFileHandle(cleanPath, this.baseDirectory);
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
