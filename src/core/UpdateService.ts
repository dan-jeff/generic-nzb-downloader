import { serviceContainer, Platform } from './ServiceContainer.js';
import { CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

interface ReleaseInfo {
  tagName: string;
  htmlUrl: string;
  assets: Array<{ name: string; browserDownloadUrl: string }>;
}

interface UpdateStatus {
  type: 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded' | 'installing';
  version?: string;
  progress?: { percent: number };
  error?: string;
}

export class UpdateService {
  private static readonly GITHUB_REPO = 'dan-jeff/generic-nzb-downloader';
  
  private currentVersion: string = '0.0.0';
  private statusCallback?: (status: UpdateStatus) => void;

  constructor() {
    this.loadCurrentVersion();
  }

  private async loadCurrentVersion(): Promise<void> {
    try {
      if (serviceContainer.isMobile) {
        const info = await App.getInfo();
        this.currentVersion = info.version;
      } else {
        const response = await fetch('/manifest.json', { cache: 'no-store' });
        if (response.ok) {
          const manifest = await response.json();
          this.currentVersion = manifest.version || '0.0.0';
        } else {
          this.currentVersion = '0.0.0';
        }
      }
    } catch {
      this.currentVersion = '0.0.0';
    }
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  setStatusCallback(callback: (status: UpdateStatus) => void): void {
    this.statusCallback = callback;
  }

  private notifyStatus(status: UpdateStatus): void {
    this.statusCallback?.(status);
  }

  async checkForUpdates(): Promise<void> {
    this.notifyStatus({ type: 'checking' });

    try {
      if (serviceContainer.platform === Platform.Electron) {
        const electronBridge = (window as any).electron;
        if (electronBridge?.checkForUpdate) {
          await electronBridge.checkForUpdate();
          return;
        }
      }

      const response = await CapacitorHttp.get({
        url: `https://api.github.com/repos/${UpdateService.GITHUB_REPO}/releases/latest`,
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      const release: ReleaseInfo = response.data;
      const latestVersion = release.tagName.replace('v', '');

      if (this.isNewerVersion(latestVersion, this.currentVersion)) {
        this.notifyStatus({ 
          type: 'available', 
          version: latestVersion 
        });
        
        await Preferences.set({
          key: 'pending_update',
          value: JSON.stringify({
            version: latestVersion,
            url: release.assets.find(a => a.name === 'app-release.apk')?.browserDownloadUrl
          })
        });
      } else {
        this.notifyStatus({ type: 'not-available' });
      }
    } catch (error) {
      console.error('Update check failed:', error);
      this.notifyStatus({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  async downloadAndInstallUpdate(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'pending_update' });
      const pendingUpdate = value ? JSON.parse(value) : null;

      if (!pendingUpdate?.url) {
        throw new Error('No pending update found');
      }

      this.notifyStatus({ type: 'downloading', version: pendingUpdate.version });

      const downloadResponse = await CapacitorHttp.get({
        url: pendingUpdate.url,
        responseType: 'blob'
      } as any);

      this.notifyStatus({ 
        type: 'downloading', 
        version: pendingUpdate.version,
        progress: { percent: 100 }
      });

      const fileName = `update-${pendingUpdate.version}.apk`;
      
      let base64Data: string;
      if (downloadResponse.data instanceof Blob) {
        base64Data = await this.blobToBase64(downloadResponse.data);
      } else {
        base64Data = downloadResponse.data as string;
      }

      const { uri } = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      this.notifyStatus({ type: 'downloaded', version: pendingUpdate.version });

      this.notifyStatus({ type: 'installing', version: pendingUpdate.version });
      
      await FileOpener.open({
        filePath: uri,
        contentType: 'application/vnd.android.package-archive'
      });
    } catch (error) {
      console.error('Download/install failed:', error);
      this.notifyStatus({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private isNewerVersion(remote: string, local: string): boolean {
    const remoteParts = remote.split('.').map(Number);
    const localParts = local.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const r = remoteParts[i] || 0;
      const l = localParts[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }
}

export const updateService = new UpdateService();