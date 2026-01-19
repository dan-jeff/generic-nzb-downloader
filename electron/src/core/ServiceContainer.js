import { Capacitor } from '@capacitor/core';
import { NodeFSAdapter } from '../../electron/adapters/NodeFSAdapter.js';
import { CapacitorFSAdapter } from '../../src/mobile/adapters/CapacitorFSAdapter.js';
import { NodeStorageAdapter } from '../../electron/adapters/NodeStorageAdapter.js';
import { ElectronRendererStorageAdapter } from './adapters/ElectronRendererStorageAdapter.js';
import { CapacitorStorageAdapter } from '../../src/mobile/adapters/CapacitorStorageAdapter.js';
import { NodeNetworkAdapter } from '../../electron/adapters/NodeNetworkAdapter.js';
import { TlsSocketNetworkAdapter } from '../../src/mobile/adapters/TlsSocketNetworkAdapter.js';
import { DownloadManager } from './download/DownloadManager.js';
import { SearchManager } from './search/SearchManager.js';
export var Platform;
(function (Platform) {
    Platform["Electron"] = "electron";
    Platform["Android"] = "android";
    Platform["IOS"] = "ios";
    Platform["Web"] = "web";
})(Platform || (Platform = {}));
export class ServiceContainer {
    _platform;
    config;
    _networkAdapter = null;
    _fileSystemAdapter = null;
    _storageAdapter = null;
    _downloadManager = null;
    _downloadManagerPromise = null;
    _searchManager = null;
    constructor(config = {}) {
        this.config = config;
        this._platform = this.detectPlatform();
    }
    detectPlatform() {
        if (this.config.forcePlatform) {
            return this.config.forcePlatform;
        }
        const isCapacitorNative = Capacitor.isNativePlatform();
        if (isCapacitorNative) {
            const platform = Capacitor.getPlatform();
            if (platform === 'android') {
                return Platform.Android;
            }
            else if (platform === 'ios') {
                return Platform.IOS;
            }
        }
        if (typeof window !== 'undefined' && window.electron) {
            return Platform.Electron;
        }
        if (typeof window !== 'undefined' && window.require?.('electron')) {
            return Platform.Electron;
        }
        if (typeof window !== 'undefined' && Capacitor.getPlatform() === 'web') {
            return Platform.Web;
        }
        return Platform.Electron;
    }
    get platform() {
        return this._platform;
    }
    get isMobile() {
        return this._platform === Platform.Android || this._platform === Platform.IOS;
    }
    get isDesktop() {
        return this._platform === Platform.Electron || this._platform === Platform.Web;
    }
    getNetworkAdapter() {
        if (!this._networkAdapter) {
            this._networkAdapter = this.createNetworkAdapter();
        }
        return this._networkAdapter;
    }
    createNetworkAdapter() {
        if (this.isMobile) {
            console.log('[ServiceContainer] Creating TlsSocketNetworkAdapter for mobile platform');
            return new TlsSocketNetworkAdapter();
        }
        else {
            console.log('[ServiceContainer] Creating NodeNetworkAdapter for desktop platform');
            return new NodeNetworkAdapter();
        }
    }
    getFileSystemAdapter() {
        if (!this._fileSystemAdapter) {
            this._fileSystemAdapter = this.createFileSystemAdapter();
        }
        return this._fileSystemAdapter;
    }
    createFileSystemAdapter() {
        if (this.isMobile) {
            return new CapacitorFSAdapter();
        }
        else {
            return new NodeFSAdapter();
        }
    }
    getStorageAdapter() {
        if (!this._storageAdapter) {
            this._storageAdapter = this.createStorageAdapter();
        }
        return this._storageAdapter;
    }
    createStorageAdapter() {
        if (this._platform === Platform.Electron) {
            return new ElectronRendererStorageAdapter();
        }
        if (this.isMobile) {
            return new CapacitorStorageAdapter();
        }
        else {
            return new NodeStorageAdapter();
        }
    }
    async getDownloadManager() {
        console.log('[ServiceContainer] getDownloadManager called, cached:', !!this._downloadManager, 'instance:', this._downloadManager ? this._downloadManager.instanceId : 'none');
        if (this._downloadManager) {
            console.log('[ServiceContainer] Returning cached DownloadManager instance:', this._downloadManager.instanceId);
            return this._downloadManager;
        }
        if (this._downloadManagerPromise) {
            console.log('[ServiceContainer] Waiting for in-flight DownloadManager creation');
            return this._downloadManagerPromise;
        }
        console.log('[ServiceContainer] Creating new DownloadManager');
        this._downloadManagerPromise = this.createDownloadManager();
        this._downloadManager = await this._downloadManagerPromise;
        this._downloadManagerPromise = null;
        console.log('[ServiceContainer] Created DownloadManager instance:', this._downloadManager.instanceId);
        return this._downloadManager;
    }
    async createDownloadManager() {
        const storage = this.getStorageAdapter();
        const fileSystem = this.getFileSystemAdapter();
        // Create a factory that returns NEW instances each time (important for connection pooling)
        const networkFactory = () => this.createNetworkAdapter();
        const manager = new DownloadManager(storage, fileSystem, networkFactory);
        await manager.initialize();
        return manager;
    }
    async getSearchManager() {
        if (!this._searchManager) {
            this._searchManager = await this.createSearchManager();
        }
        return this._searchManager;
    }
    async createSearchManager() {
        const storage = this.getStorageAdapter();
        const searchSettings = (await storage.get('searchSettings')) || [];
        return new SearchManager(searchSettings);
    }
    async refreshServices() {
        this._searchManager = null;
    }
    reset() {
        this._networkAdapter = null;
        this._fileSystemAdapter = null;
        this._storageAdapter = null;
        this._downloadManager = null;
        this._downloadManagerPromise = null;
        this._searchManager = null;
    }
}
export const serviceContainer = new ServiceContainer();
export { DownloadManager, SearchManager };
