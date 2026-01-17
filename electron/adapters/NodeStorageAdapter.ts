import Store from 'electron-store';
import { IStorage } from '../../src/core/interfaces/IStorage.js';

interface StoreType {
  [key: string]: any;
}

export class NodeStorageAdapter implements IStorage {
  private store: Store<StoreType>;

  constructor() {
    this.store = new Store();
  }

  get<T>(key: string): Promise<T | undefined>;
  get<T>(key: string, defaultValue: T): Promise<T>;
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    return this.store.get(key, defaultValue);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
