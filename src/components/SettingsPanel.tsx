import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Button,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  CircularProgress,
  Tooltip,
  Snackbar,
  Alert,
  LinearProgress,
  useTheme,
  useMediaQuery,
  Checkbox,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  ChevronRight as ChevronRightIcon,
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  Storage as StorageIcon,
  Cloud as CloudIcon,
  FolderOpen as FolderOpenIcon,
  SystemUpdateAlt as UpdateIcon,
  BugReport as BugReportIcon,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { SearchProviderSettings, IndexerConfig, NewsreaderSettings } from '../types/search';
import { useSettings } from '../hooks/useSettings';
import DirectoryPicker from './DirectoryPicker';
import debugLogger from '../utils/debugLogger';
import { serviceContainer, Platform } from '../core/ServiceContainer';

// Type Definitions
type SettingsView = 'root' | 'downloads' | 'updates' | 'indexers' | 'newsreaders' | 'logs';

export interface SettingsPanelHandle {
  handleBack: () => boolean;
}

const getElectronBridge = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as any).electron as any | undefined;
};

const SettingsPanel = forwardRef<SettingsPanelHandle>((_props, ref) => {
  // Hooks
  const { settings, downloadSettings, loading: settingsLoading, updateSettings, updateDownloadSettings, fetchSettings } = useSettings();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // State
  const [currentView, setCurrentView] = useState<SettingsView>('root');
  const [localSettings, setLocalSettings] = useState<SearchProviderSettings[]>([]);
  const [downloadDirectory, setDownloadDirectory] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const panelRef = React.useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    handleBack: () => {
      if (currentView !== 'root') {
        setCurrentView('root');
        return true;
      }
      return false;
    }
  }), [currentView]);

  // Effects
  useEffect(() => {
    // Scroll to top when view changes
    if (panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentView]);

  useEffect(() => {
    if (!settingsLoading && downloadSettings) {
      setDownloadDirectory(downloadSettings.downloadDirectory || '');
    }
  }, [settingsLoading, downloadSettings]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    const refreshDebugLogs = () => {
      const logs = debugLogger.getLogs();
      setDebugLogs(logs);
    };
    refreshDebugLogs();
    const interval = setInterval(refreshDebugLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchUpdateInfo();
    const electronBridge = getElectronBridge();
    const removeUpdateListener = electronBridge?.onUpdateStatus
      ? electronBridge.onUpdateStatus((status: any) => {
          switch (status.type) {
            case 'checking':
              setUpdateStatus('checking');
              setUpdateMessage('Checking for updates...');
              break;
            case 'available':
              setUpdateStatus('available');
              setUpdateMessage(`Version ${status.version} available`);
              break;
            case 'not-available':
              setUpdateStatus('not-available');
              setUpdateMessage('Up to date');
              break;
            case 'error':
              setUpdateStatus('error');
              setUpdateMessage(status.error || 'Update check failed');
              break;
            case 'downloading':
              setUpdateStatus('downloading');
              setUpdateProgress(status.progress?.percent || 0);
              setUpdateMessage(`Downloading... ${Math.round(status.progress?.percent || 0)}%`);
              break;
            case 'downloaded':
              setUpdateStatus('downloaded');
              setUpdateMessage(`Version ${status.version} ready to install`);
              break;
          }
        })
      : () => {};
    return () => removeUpdateListener();
  }, []);

  // Helper Functions
  const fetchUpdateInfo = async () => {
    try {
      const electronBridge = getElectronBridge();
      if (!electronBridge?.getAppVersion || !electronBridge?.getAutoUpdate) return;
      const [version, autoUpdateEnabled] = await Promise.all([
        electronBridge.getAppVersion(),
        electronBridge.getAutoUpdate(),
      ]);
      setAppVersion(version);
      setAutoUpdate(autoUpdateEnabled);
    } catch (error) {
      console.error('Failed to fetch update info:', error);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Normalize settings logic (same as before)
      const settingsToSave = localSettings.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          const newsreaders = p.newsreaders.map(nr => {
            const finalPort = (nr.port === undefined || nr.port === null || nr.port === 0 || nr.port === 563) 
              ? (nr.useSSL || true ? 563 : 119) 
              : parseInt(String(nr.port || ''), 10);
            const finalUseSSL = nr.useSSL === undefined ? true : nr.useSSL;
            return { ...nr, port: finalPort, useSSL: finalUseSSL };
          });
          return { ...p, newsreaders };
        }
        return p;
      });

      const [searchSaved, downloadSaved] = await Promise.all([
        updateSettings(settingsToSave),
        updateDownloadSettings({ downloadDirectory }),
      ]);

      if (searchSaved && downloadSaved) {
        showSnackbar('Settings saved successfully', 'success');
      } else {
        showSnackbar('Failed to save settings', 'error');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      showSnackbar('An error occurred while saving', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Logic for Sub-screens
  const nzbProvider = localSettings.find(p => p.type === 'nzb');
  const indexerCount = nzbProvider?.indexers?.length || 0;
  const activeIndexerCount = nzbProvider?.indexers?.filter(i => i.enabled !== false).length || 0;
  const newsreaderCount = nzbProvider?.newsreaders?.length || 0;
  const activeNewsreaderCount = nzbProvider?.newsreaders?.filter(n => n.enabled).length || 0;

  // Handlers
  const handleAutoUpdateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setAutoUpdate(enabled);
    getElectronBridge()?.setAutoUpdate?.(enabled);
  };

  const handleIndexerToggle = (indexerId: string) => {
    setLocalSettings(prev => prev.map(p => 
      p.type === 'nzb' && p.indexers ? {
        ...p, indexers: p.indexers.map(idx => idx.id === indexerId ? { ...idx, enabled: !idx.enabled } : idx)
      } : p
    ));
  };

  const handleIndexerChange = (indexerId: string, field: keyof IndexerConfig, value: string | boolean) => {
    setLocalSettings(prev => prev.map(p => 
      p.type === 'nzb' && p.indexers ? {
        ...p, indexers: p.indexers.map(idx => idx.id === indexerId ? { ...idx, [field]: value } : idx)
      } : p
    ));
  };

  const addIndexer = () => {
    const newIndexer: IndexerConfig = { id: crypto.randomUUID(), name: '', url: '', apiKey: '', enabled: true };
    setLocalSettings(prev => {
      const nzb = prev.find(p => p.type === 'nzb');
      if (nzb) {
        return prev.map(p => p.type === 'nzb' ? { ...p, indexers: [...(p.indexers || []), newIndexer] } : p);
      }
      return [...prev, { type: 'nzb', enabled: true, indexers: [newIndexer], newsreaders: [] }];
    });
  };

  const removeIndexer = (id: string) => {
    setLocalSettings(prev => prev.map(p => 
      p.type === 'nzb' && p.indexers ? { ...p, indexers: p.indexers.filter(idx => idx.id !== id) } : p
    ));
  };

  const addNewsreader = () => {
    const newNewsreader: NewsreaderSettings = {
      id: crypto.randomUUID(), enabled: true, name: '', type: 'direct', url: '', apiKey: '', priority: 50, downloadPath: ''
    };
    setLocalSettings(prev => {
      const nzb = prev.find(p => p.type === 'nzb');
      if (nzb) {
        return prev.map(p => p.type === 'nzb' ? { ...p, newsreaders: [...(p.newsreaders || []), newNewsreader] } : p);
      }
      return [...prev, { type: 'nzb', enabled: true, indexers: [], newsreaders: [newNewsreader] }];
    });
  };

  const removeNewsreader = (id: string) => {
    setLocalSettings(prev => prev.map(p => 
      p.type === 'nzb' && p.newsreaders ? { ...p, newsreaders: p.newsreaders.filter(nr => nr.id !== id) } : p
    ));
  };

  const handleNewsreaderChange = (id: string, field: keyof NewsreaderSettings, value: any) => {
     const parsedValue = ['maxConnections', 'segmentConcurrency', 'articleTimeoutMs', 'retryAttempts', 'retryBackoffMs', 'port', 'priority'].includes(field)
      ? (parseInt(value) || 0)
      : value;
    setLocalSettings(prev => prev.map(p => 
      p.type === 'nzb' && p.newsreaders ? {
        ...p, newsreaders: p.newsreaders.map(nr => nr.id === id ? { ...nr, [field]: parsedValue } : nr)
      } : p
    ));
  };

  const handleNewsreaderToggle = (id: string) => {
    setLocalSettings(prev => prev.map(p => 
      p.type === 'nzb' && p.newsreaders ? {
        ...p, newsreaders: p.newsreaders.map(nr => nr.id === id ? { ...nr, enabled: !nr.enabled } : nr)
      } : p
    ));
  };

  const handleSaveLogs = async () => {
    try {
      const logs = debugLogger.getFormattedLogs();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `app-logs-${timestamp}.txt`;

      if (serviceContainer.platform === Platform.Android) {
        try {
          await Filesystem.writeFile({
            path: filename,
            data: logs,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
          });
          showSnackbar(`Logs saved to Documents/${filename}`, 'success');
        } catch (e) {
          console.warn('Error saving logs to Documents, trying ExternalStorage', e);
          // Fallback to ExternalStorage if Documents fails
          await Filesystem.writeFile({
            path: filename,
            data: logs,
            directory: Directory.ExternalStorage,
            encoding: Encoding.UTF8,
          });
          showSnackbar(`Logs saved to ExternalStorage/${filename}`, 'success');
        }
      } else {
        // Fallback for Web/Electron: Download as file
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSnackbar('Logs saved to file', 'success');
      }
    } catch (error) {
      console.error('Failed to save logs:', error);
      showSnackbar('Failed to save logs: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  // Render Methods
  const renderHeader = () => (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {currentView !== 'root' ? (
          <IconButton onClick={() => setCurrentView('root')} sx={{ color: 'white', p: 0.5 }}>
            <ArrowBackIcon />
          </IconButton>
        ) : (
          <SettingsIcon sx={{ color: 'primary.main', fontSize: 26 }} />
        )}
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 600 }}>
          {currentView === 'root' ? 'SETTINGS' : 
           currentView === 'downloads' ? 'DOWNLOADS' :
           currentView === 'updates' ? 'UPDATES' :
           currentView === 'indexers' ? 'INDEXERS' :
           currentView === 'newsreaders' ? 'NEWSREADERS' :
           'SYSTEM LOGS'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        {currentView === 'root' && (
          <Tooltip title="Discard changes">
            <IconButton onClick={fetchSettings} size={isMobile ? "medium" : "small"} sx={{ color: 'rgba(255,255,255,0.3)' }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        )}
        {(currentView === 'indexers') && (
          <Tooltip title="Add Indexer">
            <IconButton
              onClick={addIndexer}
              size={isMobile ? "medium" : "small"}
              sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#00bcd4', background: 'rgba(0, 188, 212, 0.1)' } }}
            >
              <AddIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
            </IconButton>
          </Tooltip>
        )}
        {(currentView === 'newsreaders') && (
          <Tooltip title="Add Newsreader">
            <IconButton
              onClick={addNewsreader}
              size={isMobile ? "medium" : "small"}
              sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#00bcd4', background: 'rgba(0, 188, 212, 0.1)' } }}
            >
              <AddIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Save all changes">
          <IconButton 
            onClick={handleSave} 
            disabled={saving}
            size={isMobile ? "medium" : "small"}
            sx={{ 
              color: saving ? 'rgba(255,255,255,0.3)' : 'primary.main',
              border: '1px solid rgba(255,255,255,0.1)',
              bgcolor: 'rgba(33, 150, 243, 0.1)',
              '&:hover': { bgcolor: 'rgba(33, 150, 243, 0.2)' }
            }}
          >
            {saving ? <CircularProgress size={24} /> : <SaveIcon />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  const renderRootMenu = () => (
    <List sx={{ p: 0 }}>
      {/* General Section */}
      <Box sx={{ px: 2, py: 1.5, pb: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.05em' }}>GENERAL</Typography>
      </Box>
      <ListItem disablePadding>
        <ListItemButton onClick={() => setCurrentView('downloads')} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <ListItemIcon><FolderOpenIcon color="primary" sx={{ opacity: 0.8 }} /></ListItemIcon>
          <ListItemText 
            primary="Downloads" 
            secondary={downloadDirectory || 'System Default'} 
            primaryTypographyProps={{ fontWeight: 500 }}
            secondaryTypographyProps={{ noWrap: true, sx: { maxWidth: '200px' } }}
          />
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </ListItemButton>
      </ListItem>
      <ListItem disablePadding>
        <ListItemButton onClick={() => setCurrentView('updates')} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <ListItemIcon><UpdateIcon color="primary" sx={{ opacity: 0.8 }} /></ListItemIcon>
          <ListItemText 
            primary="Updates" 
            secondary={`Auto-update ${autoUpdate ? 'ON' : 'OFF'} ${appVersion ? `(v${appVersion})` : ''}`}
            primaryTypographyProps={{ fontWeight: 500 }}
          />
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </ListItemButton>
      </ListItem>

      {/* Providers Section */}
      <Box sx={{ px: 2, py: 1.5, pb: 0.5, mt: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.05em' }}>PROVIDERS</Typography>
      </Box>
      <ListItem disablePadding>
        <ListItemButton onClick={() => setCurrentView('indexers')} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <ListItemIcon><CloudIcon color="primary" sx={{ opacity: 0.8 }} /></ListItemIcon>
          <ListItemText 
            primary="NZB Indexers" 
            secondary={`${activeIndexerCount} Active, ${indexerCount - activeIndexerCount} Disabled`}
            primaryTypographyProps={{ fontWeight: 500 }}
          />
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </ListItemButton>
      </ListItem>
      <ListItem disablePadding>
        <ListItemButton onClick={() => setCurrentView('newsreaders')} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <ListItemIcon><StorageIcon color="primary" sx={{ opacity: 0.8 }} /></ListItemIcon>
          <ListItemText 
            primary="Newsreaders" 
            secondary={`${activeNewsreaderCount} Active, ${newsreaderCount - activeNewsreaderCount} Disabled`}
            primaryTypographyProps={{ fontWeight: 500 }}
          />
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </ListItemButton>
      </ListItem>

      {/* System Section */}
      <Box sx={{ px: 2, py: 1.5, pb: 0.5, mt: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.05em' }}>SYSTEM</Typography>
      </Box>
      <ListItem disablePadding>
        <ListItemButton onClick={() => setCurrentView('logs')}>
          <ListItemIcon><BugReportIcon color="primary" sx={{ opacity: 0.8 }} /></ListItemIcon>
          <ListItemText 
            primary="Debug & Logs" 
            secondary="View application logs"
            primaryTypographyProps={{ fontWeight: 500 }}
          />
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </ListItemButton>
      </ListItem>
    </List>
  );

  const renderDownloads = () => (
    <Box sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose where local downloads are saved. If left blank, the system default Downloads folder will be used.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          label="Download Directory"
          size="small"
          value={downloadDirectory}
          onChange={(e) => setDownloadDirectory(e.target.value)}
          placeholder="e.g. C:\\Downloads"
          InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
        />
        <IconButton onClick={() => setDirectoryPickerOpen(true)} sx={{ color: 'primary.main', bgcolor: 'rgba(124, 58, 237, 0.1)' }}>
          <FolderOpenIcon />
        </IconButton>
      </Box>
    </Box>
  );

  const renderUpdates = () => (
    <Box sx={{ p: 2 }}>
       <FormControlLabel
        control={<Switch checked={autoUpdate} onChange={handleAutoUpdateChange} />}
        label={
          <Box>
            <Typography sx={{ fontWeight: 500 }}>Automatically install updates</Typography>
            <Typography variant="caption" color="text.secondary">Checks GitHub releases and downloads updates</Typography>
          </Box>
        }
        sx={{ mb: 3, display: 'flex', alignItems: 'flex-start' }}
      />
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Button variant="outlined" onClick={getElectronBridge()?.checkForUpdate} disabled={updateStatus === 'checking'}>Check Now</Button>
        {updateStatus === 'downloaded' && (
          <Button variant="contained" onClick={getElectronBridge()?.quitAndInstall}>Install & Restart</Button>
        )}
      </Box>
      {updateMessage && <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>{updateMessage}</Typography>}
      {updateStatus === 'downloading' && <LinearProgress variant="determinate" value={updateProgress} sx={{ height: 6, borderRadius: 1 }} />}
    </Box>
  );

  const renderIndexers = () => (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {nzbProvider?.indexers?.map((indexer) => (
        <Paper key={indexer.id} sx={{ p: 2, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <FormControlLabel
              control={<Switch size="small" checked={indexer.enabled ?? true} onChange={() => handleIndexerToggle(indexer.id)} />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{indexer.name || 'Unnamed Indexer'}</Typography>}
            />
            <IconButton size="small" color="error" onClick={() => removeIndexer(indexer.id)} sx={{ opacity: 0.5 }}>
              <DeleteIcon />
            </IconButton>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Name" size="small" value={indexer.name} onChange={(e) => handleIndexerChange(indexer.id, 'name', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="API URL" size="small" value={indexer.url} onChange={(e) => handleIndexerChange(indexer.id, 'url', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="API Key" size="small" type="password" value={indexer.apiKey} onChange={(e) => handleIndexerChange(indexer.id, 'apiKey', e.target.value)} />
            </Grid>
          </Grid>
        </Paper>
      ))}
      {(!nzbProvider?.indexers?.length) && (
        <Typography align="center" color="text.secondary" sx={{ mt: 4 }}>No indexers configured.</Typography>
      )}
    </Box>
  );

  const renderNewsreaders = () => (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {nzbProvider?.newsreaders?.map((nr) => (
        <Paper key={nr.id} sx={{ p: 2, bgcolor: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
             <FormControlLabel
              control={<Switch size="small" checked={nr.enabled} onChange={() => handleNewsreaderToggle(nr.id)} />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{nr.name || nr.hostname || 'Unnamed Server'}</Typography>}
            />
            <IconButton size="small" color="error" onClick={() => removeNewsreader(nr.id)} sx={{ opacity: 0.5 }}>
              <DeleteIcon />
            </IconButton>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Name" size="small" value={nr.name} onChange={(e) => handleNewsreaderChange(nr.id, 'name', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
               <TextField fullWidth label="Priority" type="number" size="small" value={nr.priority} onChange={(e) => handleNewsreaderChange(nr.id, 'priority', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField fullWidth label="Hostname" size="small" value={nr.hostname || ''} onChange={(e) => handleNewsreaderChange(nr.id, 'hostname', e.target.value)} placeholder="news.example.com" />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <TextField fullWidth label="Port" type="number" size="small" value={nr.port || 563} onChange={(e) => handleNewsreaderChange(nr.id, 'port', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <FormControlLabel control={<Switch size="small" checked={nr.useSSL ?? true} onChange={(e) => handleNewsreaderChange(nr.id, 'useSSL', e.target.checked)} />} label="SSL" />
            </Grid>
             <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Username" size="small" value={nr.username || ''} onChange={(e) => handleNewsreaderChange(nr.id, 'username', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Password" type="password" size="small" value={nr.password || ''} onChange={(e) => handleNewsreaderChange(nr.id, 'password', e.target.value)} />
            </Grid>

            {/* Advanced Options Accordion */}
            <Grid size={{ xs: 12 }}>
              <Accordion 
                disableGutters 
                sx={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  boxShadow: 'none',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 1,
                  '&:before': { display: 'none' }
                }}
              >
                <AccordionSummary 
                  expandIcon={<ExpandMoreIcon sx={{ fontSize: '1.125rem' }} />}
                  sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 }, '&.Mui-expanded': { minHeight: 40 } }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Advanced Options</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField fullWidth label="Max Connections" type="number" size="small" value={nr.maxConnections ?? 2} onChange={(e) => handleNewsreaderChange(nr.id, 'maxConnections', e.target.value)} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField fullWidth label="Segment Concurrency" type="number" size="small" value={nr.segmentConcurrency ?? 10} onChange={(e) => handleNewsreaderChange(nr.id, 'segmentConcurrency', e.target.value)} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField fullWidth label="Article Timeout (ms)" type="number" size="small" value={nr.articleTimeoutMs ?? 15000} onChange={(e) => handleNewsreaderChange(nr.id, 'articleTimeoutMs', e.target.value)} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField fullWidth label="Retry Attempts" type="number" size="small" value={nr.retryAttempts ?? 3} onChange={(e) => handleNewsreaderChange(nr.id, 'retryAttempts', e.target.value)} />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField fullWidth label="Retry Backoff (ms)" type="number" size="small" value={nr.retryBackoffMs ?? 1000} onChange={(e) => handleNewsreaderChange(nr.id, 'retryBackoffMs', e.target.value)} />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Fallback Providers */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ mt: 1.5, p: 1, borderRadius: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 1 }}>Fallback Providers</Typography>
                {nzbProvider?.newsreaders?.filter(other => other.type === 'direct' && other.id !== nr.id).length === 0 ? (
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No other direct providers configured</Typography>
                ) : (
                  nzbProvider?.newsreaders?.filter(other => other.type === 'direct' && other.id !== nr.id).map(other => (
                    <FormControlLabel
                      key={other.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={(nr.fallbackProviderIds || []).includes(other.id)}
                          onChange={() => {
                             const current = nr.fallbackProviderIds || [];
                             const newVal = current.includes(other.id) ? current.filter(id => id !== other.id) : [...current, other.id];
                             handleNewsreaderChange(nr.id, 'fallbackProviderIds', newVal);
                          }}
                          sx={{ py: 0.25 }}
                        />
                      }
                      label={<Typography sx={{ fontSize: '0.9375rem' }}>{other.name || `Direct Provider ${other.id.slice(0, 8)}`}</Typography>}
                    />
                  ))
                )}
              </Box>
            </Grid>
          </Grid>
        </Paper>
      ))}
       {(!nzbProvider?.newsreaders?.length) && (
        <Typography align="center" color="text.secondary" sx={{ mt: 4 }}>No newsreaders configured.</Typography>
      )}
    </Box>
  );

  const renderLogs = () => (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={() => {
           navigator.clipboard.writeText(debugLogs.join('\n'));
           showSnackbar('Logs copied', 'success');
        }} disabled={!debugLogs.length}>Copy</Button>
        <Button variant="outlined" size="small" startIcon={<FileDownloadIcon />} onClick={handleSaveLogs} disabled={!debugLogs.length}>
          Save to File
        </Button>
        <Button variant="outlined" size="small" startIcon={<DeleteIcon />} onClick={() => {
          debugLogger.clearLogs();
          setDebugLogs([]);
        }} disabled={!debugLogs.length}>Clear</Button>
      </Box>
      <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 1, p: 2, fontFamily: 'monospace', fontSize: '0.75rem', maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
        {debugLogs.length ? debugLogs.map((l, i) => (
          <Box key={i} sx={{ color: l.includes('[ERROR]') ? '#f87171' : l.includes('[WARN]') ? '#fbbf24' : '#e2e8f0', mb: 0.5 }}>{l}</Box>
        )) : <Typography color="text.secondary">No logs available</Typography>}
      </Box>
    </Box>
  );

  if (settingsLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box ref={panelRef} sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>
      {renderHeader()}
      <Paper sx={{ background: 'rgba(15, 23, 42, 0.3)', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
        {currentView === 'root' && renderRootMenu()}
        {currentView === 'downloads' && renderDownloads()}
        {currentView === 'updates' && renderUpdates()}
        {currentView === 'indexers' && renderIndexers()}
        {currentView === 'newsreaders' && renderNewsreaders()}
        {currentView === 'logs' && renderLogs()}
      </Paper>
      
      <DirectoryPicker
        open={directoryPickerOpen}
        onClose={() => setDirectoryPickerOpen(false)}
        onSelect={(path) => { setDownloadDirectory(path); setDirectoryPickerOpen(false); }}
        initialPath={downloadDirectory}
      />
      
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
});

export default SettingsPanel;