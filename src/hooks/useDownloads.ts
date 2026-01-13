import { useState, useEffect, useCallback } from 'react';
import { DownloadProgress, DownloadHistoryItem } from '../electron';

export const useDownloads = () => {
  const [activeDownloads, setActiveDownloads] = useState<Map<string, DownloadProgress>>(new Map());
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await window.electron.getHistory();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();

    const unsubscribeProgress = window.electron.onDownloadProgress((progress) => {
      setActiveDownloads((prev) => {
        const next = new Map(prev);
        if (progress.status === 'completed') {
          next.delete(progress.id);
        } else {
          next.set(progress.id, progress);
        }
        return next;
      });
    });

    const unsubscribeCompleted = window.electron.onDownloadCompleted((item) => {
      setActiveDownloads((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      setHistory((prev) => [item, ...prev]);
    });

    return () => {
      unsubscribeProgress();
      unsubscribeCompleted();
    };
  }, [fetchHistory]);

  const startDownload = async (url: string | ArrayBuffer, target?: 'local' | 'newsreader', filename?: string) => {
    try {
      await window.electron.startDownload(url, target, filename);
    } catch (error) {
      console.error('Failed to start download:', error);
    }
  };

  const clearHistory = async () => {
    try {
      await window.electron.clearHistory();
      setHistory([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  const pauseDownload = async (id: string) => {
    try {
      await window.electron.pauseDownload(id);
    } catch (error) {
      console.error('Failed to pause download:', error);
    }
  };

  const deleteDownload = async (id: string) => {
    try {
      await window.electron.deleteDownload(id);
      setActiveDownloads((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      fetchHistory();
    } catch (error) {
      console.error('Failed to delete download:', error);
    }
  };

  const deleteDownloadWithFiles = async (id: string) => {
    try {
      await window.electron.deleteDownloadWithFiles(id);
      setActiveDownloads((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
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
  };
};
