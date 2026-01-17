import { IStorage } from '../interfaces/IStorage.js';
import type { ElectronBridge } from '../../electron.d.ts';

export class ElectronRendererStorageAdapter implements IStorage {
  private get electron(): ElectronBridge | undefined {
    return (window as any).electron;
  }

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const electron = this.electron;
    if (!electron) {
      return defaultValue;
    }

    if (key === 'searchSettings') {
      return (await electron.getSearchSettings()) as T;
    }
    if (key === 'downloadSettings') {
      return (await electron.getDownloadSettings()) as T;
    }
    return defaultValue;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const electron = this.electron;
    if (!electron) {
      throw new Error('Not running in Electron');
    }

    if (key === 'searchSettings') {
      await electron.updateSearchSettings(value as any);
    } else if (key === 'downloadSettings') {
      await electron.updateDownloadSettings(value as any);
    }
  }

  async delete(_key: string): Promise<void> {
    console.warn('ElectronRendererStorageAdapter.delete() is not implemented');
  }

  async clear(): Promise<void> {
    console.warn('ElectronRendererStorageAdapter.clear() is not implemented');
  }
}
