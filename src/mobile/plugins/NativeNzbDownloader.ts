import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface NativeDownloadJob {
  id: string;
  filename: string;
  downloadPath: string;
  segments: {
    number: number;
    bytes: number;
    messageId: string;
  }[];
  server: {
    host: string;
    port: number;
    ssl: boolean;
    user?: string;
    pass?: string;
    connections?: number;
  };
}

export interface NativeDownloadProgress {
  jobId: string;
  bytes: number;
  totalBytes: number;
  completed: number; // segments completed
  total: number;     // total segments
  progress: number;  // 0.0 to 1.0
}

export interface NativeDownloadError {
  jobId: string;
  message: string;
}

export interface NativeNzbDownloaderPlugin {
  addJob(options: NativeDownloadJob): Promise<void>;
  cancelJob(options: { jobId: string }): Promise<void>;
  cleanupPar2Files(options: { downloadPath: string }): Promise<void>;
  deletePath(options: { path: string }): Promise<void>;
  fetchNzbContent(options: { url: string }): Promise<{ data: string }>;
  addListener(
    eventName: 'progress',
    listenerFunc: (progress: NativeDownloadProgress) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(
    eventName: 'error',
    listenerFunc: (error: NativeDownloadError) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  removeAllListeners(): Promise<void>;
}

const NativeNzbDownloader = registerPlugin<NativeNzbDownloaderPlugin>('NativeNzbDownloader');

export default NativeNzbDownloader;
