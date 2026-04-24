import { useState, useEffect, useCallback } from 'react';
import { DownloadProgress, DownloadHistoryItem } from '../electron';
import { serviceContainer } from '@/core/ServiceContainer';
import { DownloadManager } from '@/core/download/DownloadManager';
import { getElectronBridge } from '../utils/platform';

export const useDownloads = () => {
  const [activeDownloads, setActiveDownloads] = useState<Map<string, DownloadProgress>>(new Map());
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const electron = getElectronBridge();
      if (electron) {
        setHistory(await electron.getHistory());
        return;
      }
      const storage = serviceContainer.getStorageAdapter();
      const rawData = (await storage.get<any[]>('history')) || [];
      setHistory(rawData.map(item => ({
        id: item.id,
        url: item.url,
        filename: item.filename,
        path: item.savePath,
        timestamp: item.endTime || item.startTime,
        size: item.totalBytes || 0,
        providerName: item.providerName,
        externalId: item.externalId,
        status: item.status,
      })));
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();

    const electron = getElectronBridge();
    let mounted = true;
    let unsubscribeProgress: (() => void) | undefined;
    let unsubscribeCompleted: (() => void) | undefined;
    let manager: DownloadManager | null = null;

    const handleProgress = (progress: DownloadProgress) => {
      if (!mounted) return;
      setActiveDownloads(prev => {
        const next = new Map(prev);
        if (progress.status === 'completed') {
          next.delete(progress.id);
        } else {
          next.set(progress.id, progress);
        }
        return next;
      });
    };

    const handleCompleted = (item: DownloadHistoryItem) => {
      if (!mounted) return;
      setActiveDownloads(prev => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      setHistory(prev => [item, ...prev]);
    };

    if (electron) {
      unsubscribeProgress = electron.onDownloadProgress(handleProgress);
      unsubscribeCompleted = electron.onDownloadCompleted(handleCompleted);
    } else {
      (async () => {
        manager = await serviceContainer.getDownloadManager();
        if (!mounted) return;
        manager.on('download-progress', handleProgress);
        manager.on('download-completed', handleCompleted);
      })();
    }

    return () => {
      mounted = false;
      unsubscribeProgress?.();
      unsubscribeCompleted?.();
      if (manager) {
        manager.off('download-progress', handleProgress);
        manager.off('download-completed', handleCompleted);
      }
    };
  }, [fetchHistory]);

  const startDownload = async (url: string | ArrayBuffer, target?: 'local' | 'newsreader', filename?: string, providerId?: string) => {
    try {
      const electron = getElectronBridge();
      if (electron) {
        await electron.startDownload(url, target, filename, providerId);
        return;
      }
      const downloadManager = await serviceContainer.getDownloadManager();
      const buffer = typeof url === 'string' ? url : Buffer.from(url);
      await downloadManager.addDownload(buffer, filename || 'download', undefined, target);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error));
      console.error('Failed to start download:', error);
      throw new Error(message || 'Unknown download error');
    }
  };

  const clearHistory = async () => {
    try {
      const electron = getElectronBridge();
      if (electron) {
        await electron.clearHistory();
      } else {
        await serviceContainer.getStorageAdapter().set('history', []);
      }
      setHistory([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  const pauseDownload = async (id: string) => {
    try {
      const electron = getElectronBridge();
      if (electron) {
        await electron.pauseDownload(id);
      } else {
        await (await serviceContainer.getDownloadManager()).pause(id);
      }
    } catch (error) {
      console.error('Failed to pause download:', error);
    }
  };

  const removeFromActive = (id: string) => {
    setActiveDownloads(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const deleteDownload = async (id: string) => {
    try {
      const electron = getElectronBridge();
      if (electron) {
        await electron.deleteDownload(id);
      } else {
        await (await serviceContainer.getDownloadManager()).delete(id, false);
      }
      removeFromActive(id);
      fetchHistory();
    } catch (error) {
      console.error('Failed to delete download:', error);
    }
  };

  const deleteDownloadWithFiles = async (id: string) => {
    try {
      const electron = getElectronBridge();
      if (electron) {
        await electron.deleteDownloadWithFiles(id);
      } else {
        await (await serviceContainer.getDownloadManager()).deleteWithFiles(id);
      }
      removeFromActive(id);
      fetchHistory();
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
    refreshHistory: fetchHistory,
  };
};
