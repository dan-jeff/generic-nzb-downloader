import { Preferences } from '@capacitor/preferences';
export class CapacitorStorageAdapter {
    async get(key, defaultValue) {
        try {
            const { value } = await Preferences.get({ key });
            if (value === null) {
                return defaultValue;
            }
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        catch (err) {
            console.error(`Error getting storage value for key "${key}":`, err);
            return defaultValue;
        }
    }
    async set(key, value) {
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            await Preferences.set({ key, value: serialized });
        }
        catch (err) {
            throw new Error(`Failed to set storage value for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async delete(key) {
        try {
            await Preferences.remove({ key });
        }
        catch (err) {
            throw new Error(`Failed to delete storage value for key "${key}": ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async clear() {
        try {
            await Preferences.clear();
        }
        catch (err) {
            throw new Error(`Failed to clear storage: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
