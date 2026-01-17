import { Preferences } from '@capacitor/preferences';
import { IStorage } from '../../core/interfaces/IStorage.js';

export class CapacitorStorageAdapter implements IStorage {
  async get<T>(key: string): Promise<T | undefined>;
  async get<T>(key: string, defaultValue: T): Promise<T>;
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const { value } = await Preferences.get({ key });
      
      if (value === null) {
        return defaultValue;
      }

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (err) {
      console.error(`Error getting storage value for key "${key}":`, err);
      return defaultValue;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await Preferences.set({ key, value: serialized });
    } catch (err) {
      throw new Error(`Failed to set storage value for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch (err) {
      throw new Error(`Failed to delete storage value for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await Preferences.clear();
    } catch (err) {
      throw new Error(`Failed to clear storage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
