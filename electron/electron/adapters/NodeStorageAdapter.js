import Store from 'electron-store';
export class NodeStorageAdapter {
    store;
    constructor() {
        this.store = new Store();
    }
    async get(key, defaultValue) {
        return this.store.get(key, defaultValue);
    }
    async set(key, value) {
        this.store.set(key, value);
    }
    async delete(key) {
        this.store.delete(key);
    }
    async clear() {
        this.store.clear();
    }
}
