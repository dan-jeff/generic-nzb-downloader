import { useState, useCallback, useEffect } from 'react';
import { SearchProviderSettings } from '../types/search';
import { DownloadSettings } from '../electron';
import { serviceContainer } from '@/core/ServiceContainer';

export const useSettings = () => {
  const [settings, setSettings] = useState<SearchProviderSettings[]>([]);
  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings>({ downloadDirectory: '' });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const storage = serviceContainer.getStorageAdapter();
      const searchSettings = (await storage.get<SearchProviderSettings[]>('searchSettings')) || [];
      const dlSettings = (await storage.get<DownloadSettings>('downloadSettings')) || { downloadDirectory: '' };
      
      // NEW: Normalize useSSL for direct newsreaders
      const normalizedSettings = searchSettings.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          const newsreaders = p.newsreaders.map(nr => {
            // Normalize port and useSSL
            const port = nr.port || (nr.useSSL ?? true ? 563 : 119);
            const useSSL = nr.useSSL ?? true;  // Default to true if undefined
            
            console.log(`[useSettings] Normalizing newsreader "${nr.name || nr.id}": port=${port}, useSSL=${useSSL}`);
            
            return {
              ...nr,
              port,
              useSSL
            };
          });
          
          return {
            ...p,
            newsreaders
          };
        }
        return p;
      });
      
      console.log('[useSettings] Normalized settings:', JSON.stringify(normalizedSettings));
      
      // Continue with rest of function
      setSettings(normalizedSettings);
      setDownloadSettings(dlSettings);
      
      const searchManager = await serviceContainer.getSearchManager();
      searchManager.updateProviders(normalizedSettings);
      
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: SearchProviderSettings[]) => {
    try {
      const storage = serviceContainer.getStorageAdapter();
      await storage.set('searchSettings', newSettings);
      setSettings(newSettings);
      
      const downloadManager = await serviceContainer.getDownloadManager();
      await downloadManager.updateSettings();
      
      const searchManager = await serviceContainer.getSearchManager();
      searchManager.updateProviders(newSettings);
      
      return true;
    } catch (error) {
      console.error('Failed to update settings:', error);
      return false;
    }
  }, []);

  const updateDownloadSettings = useCallback(async (newSettings: DownloadSettings) => {
    try {
      const storage = serviceContainer.getStorageAdapter();
      await storage.set('downloadSettings', newSettings);
      setDownloadSettings(newSettings);
      return true;
    } catch (error) {
      console.error('Failed to update download settings:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    downloadSettings,
    loading,
    fetchSettings,
    updateSettings,
    updateDownloadSettings,
  };
};