import { Writable } from 'stream';
import * as fs from 'fs';
import { IFileSystem, FileHandle } from '../../src/core/interfaces/IFileSystem.js';

class NodeFileHandle implements FileHandle {
  private handle: any;

  constructor(handle: any) {
    this.handle = handle;
  }

  async write(data: Buffer, offset: number, length: number, position: number): Promise<{ bytesWritten: number; buffer: Buffer }> {
    return await this.handle.write(data, offset, length, position);
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

export class NodeFSAdapter implements IFileSystem {
  writeStream(path: string): Writable {
    return fs.createWriteStream(path);
  }

  async readFile(path: string): Promise<Buffer> {
    return await fs.promises.readFile(path);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await fs.promises.mkdir(path, { recursive: true });
  }

  async unlink(path: string): Promise<void> {
    await fs.promises.unlink(path);
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    await fs.promises.writeFile(path, data);
  }

  async open(path: string, flags: string): Promise<FileHandle> {
    const handle = await fs.promises.open(path, flags);
    return new NodeFileHandle(handle);
  }

  async readdir(path: string): Promise<{ name: string; type: 'file' | 'directory' }[]> {
    const entries = await fs.promises.readdir(path, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file'
    }));
  }
}
