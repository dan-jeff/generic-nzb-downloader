export interface FileHandle {
  write(data: Buffer, offset: number, length: number, position: number): Promise<{ bytesWritten: number; buffer: Buffer }>;
  close(): Promise<void>;
}

export interface IFileSystem {
  writeStream(path: string): any;
  readFile(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  open(path: string, flags: string): Promise<FileHandle>;
  readdir(path: string): Promise<{ name: string; type: 'file' | 'directory' }[]>;
}
