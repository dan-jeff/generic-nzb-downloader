import { EventEmitter } from 'events';

export interface INetwork extends EventEmitter {
  connect(hostname: string, port: number, useSSL: boolean): Promise<void>;
  write(data: string, encoding: BufferEncoding, callback?: (err?: Error | null) => void): boolean;
  pause(): void;
  resume(): void;
  end(): void;
  destroy(): void;
  readonly destroyed: boolean;
  readonly isPaused: () => boolean;

  on(event: 'connect', listener: () => void): this;
  on(event: 'data', listener: (data: Buffer) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'close', listener: (hadError: boolean) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: 'connect', listener: () => void): this;
  once(event: 'data', listener: (data: Buffer) => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'close', listener: (hadError: boolean) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  emit(event: 'connect'): boolean;
  emit(event: 'data', data: Buffer): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(event: 'close', hadError: boolean): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}

export type NetworkFactory = () => INetwork;
