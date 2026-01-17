export type DownloadState = 'Downloading' | 'Paused' | 'Queued' | 'Completed' | 'Failed' | 'Checking' | 'Repairing' | 'Extracting' | 'Assembling' | 'Deleted';

export interface DownloadStatus {
  id: string;
  name: string;
  size: number;
  remainingSize: number;
  progress: number; // 0-100
  status: DownloadState;
  speed: number; // bytes per second
  eta: number; // seconds
  category?: string;
  outputPath?: string;
}
