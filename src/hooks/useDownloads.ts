import { useState, useEffect, useCallback } from 'react';
import { DownloadProgress, DownloadHistoryItem } from '../electron';
import { serviceContainer } from '@/core/ServiceContainer';
import { DownloadManager } from '@/core/download/DownloadManager';

export const useDownloads = () => {
  const [activeDownloads, setActiveDownloads] = useState<Map<string, DownloadProgress>>(new Map());
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const electron = (window as any).electron;
      if (electron && electron.getHistory) {
        const data = await electron.getHistory();
        setHistory(data);
      } else {
        const storage = serviceContainer.getStorageAdapter();
        const data = (await storage.get<DownloadHistoryItem[]>('history')) || [];
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();

    const electron = (window as any).electron;
    let mounted = true;
    let unsubscribeProgress: (() => void) | undefined;
    let unsubscribeCompleted: (() => void) | undefined;
    let manager: DownloadManager | null = null;

    const handleProgress = (progress: any) => {
      if (!mounted) return;
      console.log('[useDownloads] handleProgress called:', progress);
      setActiveDownloads((prev) => {
        const next = new Map(prev);
        if (progress.status === 'completed') {
          next.delete(progress.id);
        } else {
          next.set(progress.id, progress);
        }
        return next;
      });
    };

    const handleCompleted = (item: any) => {
      if (!mounted) return;
      console.log('[useDownloads] handleCompleted called:', item);
      setActiveDownloads((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      setHistory((prev) => [item, ...prev]);
    };

    if (electron && electron.onDownloadProgress && electron.onDownloadCompleted) {
      console.log('[useDownloads] Setting up Electron event listeners');
      unsubscribeProgress = electron.onDownloadProgress(handleProgress);
      unsubscribeCompleted = electron.onDownloadCompleted(handleCompleted);
    } else {
      console.log('[useDownloads] Setting up DownloadManager event listeners');
      const init = async () => {
        manager = await serviceContainer.getDownloadManager();
        if (!mounted) {
          console.log('[useDownloads] Component unmounted before manager ready, skipping listener setup');
          return;
        }
        console.log('[useDownloads] DownloadManager ready, instance:', (manager as any).instanceId);
        console.log('[useDownloads] EventEmitter listener count before attach:', manager.listenerCount('download-progress'), manager.listenerCount('download-completed'));
        manager.on('download-progress', handleProgress);
        manager.on('download-completed', handleCompleted);
        console.log('[useDownloads] EventEmitter listener count after attach:', manager.listenerCount('download-progress'), manager.listenerCount('download-completed'));
      };
      init();
    }

    return () => {
      mounted = false;
      console.log('[useDownloads] Cleanup: removing event listeners');
      unsubscribeProgress?.();
      unsubscribeCompleted?.();
      if (manager) {
        manager.off('download-progress', handleProgress);
        manager.off('download-completed', handleCompleted);
      }
    };
  }, [fetchHistory]);

  const startDownload = async (url: string | ArrayBuffer, target?: 'local' | 'newsreader', filename?: string, providerId?: string) => {
    const electron = (window as any).electron;
    const capacitor = (window as any).Capacitor;
    console.log('[useDownloads] startDownload called:', { url, target, filename });
    console.log('[useDownloads] Platform:', capacitor && capacitor.isNativePlatform ? capacitor.getPlatform() : 'unknown');

    try {
      if (electron && electron.startDownload) {
        console.log('[useDownloads] Using Electron download');
        await electron.startDownload(url, target, filename, providerId);
      } else {
        console.log('[useDownloads] Using DownloadManager');
        const downloadManager = await serviceContainer.getDownloadManager();
        const buffer = typeof url === 'string' ? url : Buffer.from(url);
        console.log('[useDownloads] Buffer created, type:', typeof url);
        await downloadManager.addDownload(buffer, filename || 'download', undefined, target);
      }
    } catch (error) {
      console.log('[useDownloads] Caught error in startDownload:', error);
      console.log('[useDownloads] Error type:', typeof error);
      console.log('[useDownloads] Error constructor:', error?.constructor?.name);
      const errorMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
      console.error('Failed to start download:', error);
      throw new Error(errorMsg || 'Unknown download error');
    }
  };

  const clearHistory = async () => {
    try {
      const electron = (window as any).electron;
      if (electron && electron.clearHistory) {
        await electron.clearHistory();
        setHistory([]);
      } else {
        const storage = serviceContainer.getStorageAdapter();
        await storage.set('history', []);
        setHistory([]);
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  const pauseDownload = async (id: string) => {
    try {
      const electron = (window as any).electron;
      if (electron && electron.pauseDownload) {
        await electron.pauseDownload(id);
      } else {
        const downloadManager = await serviceContainer.getDownloadManager();
        await downloadManager.pause(id);
      }
    } catch (error) {
      console.error('Failed to pause download:', error);
    }
  };

  const deleteDownload = async (id: string) => {
    try {
      const electron = (window as any).electron;
      if (electron && electron.deleteDownload) {
        await electron.deleteDownload(id);
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        fetchHistory();
      } else {
        const downloadManager = await serviceContainer.getDownloadManager();
        await downloadManager.delete(id, false);
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        fetchHistory();
      }
    } catch (error) {
      console.error('Failed to delete download:', error);
    }
  };

  const deleteDownloadWithFiles = async (id: string) => {
    try {
      const electron = (window as any).electron;
      if (electron && electron.deleteDownloadWithFiles) {
        await electron.deleteDownloadWithFiles(id);
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        fetchHistory();
      } else {
        const downloadManager = await serviceContainer.getDownloadManager();
        await downloadManager.deleteWithFiles(id);
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        fetchHistory();
      }
    } catch (error) {
      console.error('Failed to delete download with files:', error);
    }
  };

  return {
    activeDownloads: Array.from(activeDownloads.values()),
    history,
    startDownload,
    clearHistory,
    pauseDownload,
    deleteDownload,
    deleteDownloadWithFiles,
  };
};
