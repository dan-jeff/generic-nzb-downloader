import { SearchResult, SearchProviderSettings } from './types/search';

export interface DownloadProgress {
  id: string;
  filename: string;
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  providerName: string;
  externalId?: string;
  status: 'downloading' | 'completed' | 'failed' | 'paused' | 'queued';
  speed?: number;
  path?: string;
}

export interface DownloadHistoryItem {
  id: string;
  url: string;
  filename: string;
  path: string;
  timestamp: number;
  size: number;
  providerName: string;
  externalId?: string;
  status: 'downloading' | 'completed' | 'failed' | 'paused' | 'queued';
}

export interface DownloadSettings {
  downloadDirectory: string;
  autoExtract?: boolean;
}

export interface UpdateStatus {
  type: 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded';
  version?: string;
  error?: string;
  progress?: {
    percent: number;
    transferred: number;
    total: number;
  };
}

export interface ElectronBridge {
  startDownload: (url: string | ArrayBuffer, target?: 'local' | 'newsreader', filename?: string, providerId?: string) => Promise<void>;
  getHistory: () => Promise<DownloadHistoryItem[]>;
  clearHistory: () => Promise<void>;
  search: (query: string) => Promise<SearchResult[]>;
  getSearchSettings: () => Promise<SearchProviderSettings[]>;
  updateSearchSettings: (settings: SearchProviderSettings[]) => Promise<boolean>;
  getDownloadSettings: () => Promise<DownloadSettings>;
  updateDownloadSettings: (settings: DownloadSettings) => Promise<boolean>;
  pauseDownload: (id: string) => Promise<boolean>;
  deleteDownload: (id: string) => Promise<boolean>;
  deleteDownloadWithFiles: (id: string) => Promise<boolean>;
  openPath: (path: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getAutoUpdate: () => Promise<boolean>;
  setAutoUpdate: (enable: boolean) => void;
  checkForUpdate: () => void;
  quitAndInstall: () => void;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onDownloadCompleted: (callback: (item: DownloadHistoryItem) => void) => () => void;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}
