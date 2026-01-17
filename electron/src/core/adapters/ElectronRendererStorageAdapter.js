export class ElectronRendererStorageAdapter {
    get electron() {
        return window.electron;
    }
    async get(key, defaultValue) {
        const electron = this.electron;
        if (!electron) {
            return defaultValue;
        }
        if (key === 'searchSettings') {
            return (await electron.getSearchSettings());
        }
        if (key === 'downloadSettings') {
            return (await electron.getDownloadSettings());
        }
        return defaultValue;
    }
    async set(key, value) {
        const electron = this.electron;
        if (!electron) {
            throw new Error('Not running in Electron');
        }
        if (key === 'searchSettings') {
            await electron.updateSearchSettings(value);
        }
        else if (key === 'downloadSettings') {
            await electron.updateDownloadSettings(value);
        }
    }
    async delete(_key) {
        console.warn('ElectronRendererStorageAdapter.delete() is not implemented');
    }
    async clear() {
        console.warn('ElectronRendererStorageAdapter.clear() is not implemented');
    }
}
