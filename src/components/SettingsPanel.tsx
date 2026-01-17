import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Divider,
  Button,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Snackbar,
  CircularProgress,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Checkbox,
  LinearProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Capacitor } from '@capacitor/core';
import { serviceContainer } from '../core/ServiceContainer';
import {
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  Cloud as CloudIcon,
  FolderOpen as FolderOpenIcon,
  SystemUpdateAlt as UpdateIcon,
  BugReport as BugReportIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { SearchProviderSettings, IndexerConfig, NewsreaderSettings } from '../types/search';
import { useSettings } from '../hooks/useSettings';
import DirectoryPicker from './DirectoryPicker';
import debugLogger from '../utils/debugLogger';

const getElectronBridge = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as any).electron as any | undefined;
};

const SettingsPanel: React.FC = () => {
  const { settings, downloadSettings, loading: settingsLoading, updateSettings, updateDownloadSettings, fetchSettings } = useSettings();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [downloadDirectory, setDownloadDirectory] = useState('');
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded'
  >('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [expanded, setExpanded] = useState<string | false>(false);
  const [localSettings, setLocalSettings] = useState<SearchProviderSettings[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [platform, setPlatform] = useState<string>('web');
  const [networkStatus, setNetworkStatus] = useState<string>('Checking...');

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
      setLastUpdated(new Date().toLocaleTimeString());
    };

    refreshDebugLogs();
    const interval = setInterval(refreshDebugLogs, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    setPlatform(platform);
  }, []);

  useEffect(() => {
    let networkAdapter: any;

    try {
      networkAdapter = serviceContainer.getNetworkAdapter();

      if (networkAdapter && typeof networkAdapter.on === 'function') {
        const handleNetworkEvent = (status: { online: boolean }) => {
          setNetworkStatus(status.online ? 'online' : 'offline');
        };

        networkAdapter.on('network', handleNetworkEvent);

        return () => {
          if (networkAdapter && typeof networkAdapter.off === 'function') {
            networkAdapter.off('network', handleNetworkEvent);
          }
        };
      }
    } catch (error) {
      console.error('Failed to get network adapter:', error);
    }

    setNetworkStatus('unknown');

    const handleOnline = () => setNetworkStatus('online');
    const handleOffline = () => setNetworkStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setNetworkStatus(navigator.onLine ? 'online' : 'offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
              setUpdateMessage(
                `Downloading... ${Math.round(status.progress?.percent || 0)}%`
              );
              break;
            case 'downloaded':
              setUpdateStatus('downloaded');
              setUpdateMessage(`Version ${status.version} ready to install`);
              break;
          }
        })
      : () => {};

    return () => {
      removeUpdateListener();
    };
  }, []);

  const handleAccordionChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const fetchUpdateInfo = async () => {
    try {
      const electronBridge = getElectronBridge();
      if (!electronBridge?.getAppVersion || !electronBridge?.getAutoUpdate) {
        return;
      }
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

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Normalize direct newsreader ports AND useSSL before saving
      const settingsToSave = localSettings.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          const newsreaders = p.newsreaders.map(nr => {
            const port = nr.port;
            const useSSL = nr.useSSL;
            
            // Log current state
            console.log(`[SettingsPanel] Newsreader "${nr.name || nr.id}" - current port:`, port, `useSSL:`, useSSL);
            
            // If port is undefined/empty, set default based on SSL
            const finalPort = (port === undefined || port === null || port === 0 || port === 563) 
              ? (useSSL || true ? 563 : 119) 
              : parseInt(String(port || ''), 10);
            
            // CRITICAL FIX: If useSSL is undefined, force it to true for direct newsreaders
            const finalUseSSL = useSSL === undefined ? true : useSSL;
            
            console.log(`[SettingsPanel] Newsreader "${nr.name || nr.id}" - normalized useSSL:`, finalUseSSL);
            
            return {
              ...nr,
              port: finalPort,
              useSSL: finalUseSSL
            };
          });
          
          return {
            ...p,
            newsreaders
          };
        }
        return p;
      });
      
      console.log('[SettingsPanel] Final settings before save:', JSON.stringify(settingsToSave));
      
      const [searchSaved, downloadSaved] = await Promise.all([
        updateSettings(settingsToSave),
        updateDownloadSettings({ downloadDirectory }),
      ]);
      
      console.log('[SettingsPanel] Save results - searchSaved:', searchSaved, 'downloadSaved:', downloadSaved);
      
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

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleAutoUpdateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setAutoUpdate(enabled);
    const electronBridge = getElectronBridge();
    electronBridge?.setAutoUpdate?.(enabled);
  };

  const handleCheckForUpdate = () => {
    setUpdateStatus('checking');
    setUpdateMessage('Checking for updates...');
    const electronBridge = getElectronBridge();
    electronBridge?.checkForUpdate?.();
  };

  const handleQuitAndInstall = () => {
    const electronBridge = getElectronBridge();
    electronBridge?.quitAndInstall?.();
  };

  const handleProviderToggle = (type: string) => {
    console.log(`Toggling provider ${type}`);
    setLocalSettings(prev => prev.map(p => 
      p.type === type ? { ...p, enabled: !p.enabled } : p
    ));
  };

  const handleIndexerChange = (indexerId: string, field: keyof IndexerConfig, value: string | boolean) => {
    setLocalSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb' && p.indexers) {
          return {
            ...p,
            indexers: p.indexers.map(idx =>
              idx.id === indexerId ? { ...idx, [field]: value } : idx
            ),
          };
        }
        return p;
      })
    );
  };

  const addIndexer = () => {
    const newIndexer: IndexerConfig = {
      id: crypto.randomUUID(),
      name: '',
      url: '',
      apiKey: '',
      enabled: true,
    };

    setLocalSettings(prev => {
      const nzbProvider = prev.find(p => p.type === 'nzb');
      if (nzbProvider) {
        return prev.map(p => {
          if (p.type === 'nzb') {
            return {
              ...p,
              indexers: [...(p.indexers || []), newIndexer],
            };
          }
          return p;
        });
      } else {
        return [...prev, { type: 'nzb', enabled: true, indexers: [newIndexer], newsreaders: [] }];
      }
    });
  };

  const removeIndexer = (id: string) => {
    setLocalSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb' && p.indexers) {
          return {
            ...p,
            indexers: p.indexers.filter(idx => idx.id !== id),
          };
        }
        return p;
      })
    );
  };

  const handleNewsreaderToggle = (id: string) => {
    setLocalSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          return {
            ...p,
            newsreaders: p.newsreaders.map(nr =>
              nr.id === id ? { ...nr, enabled: !nr.enabled } : nr
            ),
          };
        }
        return p;
      })
    );
  };

  const handleNewsreaderChange = (id: string, field: keyof NewsreaderSettings, value: any) => {
    const parsedValue = ['maxConnections', 'segmentConcurrency', 'articleTimeoutMs', 'retryAttempts', 'retryBackoffMs'].includes(field)
      ? (parseInt(value) || 0)
      : value;
    
    setLocalSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          return {
            ...p,
            newsreaders: p.newsreaders.map(nr =>
              nr.id === id ? { ...nr, [field]: parsedValue } : nr
            ),
          };
        }
        return p;
      })
    );
  };

  const handleFallbackProviderToggle = (providerId: string, newsreaderId: string) => {
    setLocalSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          return {
            ...p,
            newsreaders: p.newsreaders.map(nr => {
              if (nr.id === newsreaderId) {
                const currentFallbackIds = nr.fallbackProviderIds || [];
                const newFallbackIds = currentFallbackIds.includes(providerId)
                  ? currentFallbackIds.filter(id => id !== providerId)
                  : [...currentFallbackIds, providerId];
                return { ...nr, fallbackProviderIds: newFallbackIds };
              }
              return nr;
            }),
          };
        }
        return p;
      })
    );
  };

  const addNewsreader = () => {
    const newNewsreader: NewsreaderSettings = {
      id: crypto.randomUUID(),
      enabled: true,
      name: '',
      type: 'sabnzbd',
      url: '',
      apiKey: '',
      priority: 50,
      downloadPath: '',
    };

    setLocalSettings(prev => {
      const nzbProvider = prev.find(p => p.type === 'nzb');
      if (nzbProvider) {
        return prev.map(p => {
          if (p.type === 'nzb') {
            return {
              ...p,
              newsreaders: [...(p.newsreaders || []), newNewsreader],
            };
          }
          return p;
        });
      } else {
        return [...prev, { type: 'nzb', enabled: true, indexers: [], newsreaders: [newNewsreader] }];
      }
    });
  };

  const removeNewsreader = (id: string) => {
    setLocalSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb' && p.newsreaders) {
          return {
            ...p,
            newsreaders: p.newsreaders.filter(nr => nr.id !== id),
          };
        }
        return p;
      })
    );
  };

  const handleCopyLogs = () => {
    const logsText = debugLogs.join('\n');
    navigator.clipboard.writeText(logsText).then(() => {
      showSnackbar('Logs copied to clipboard', 'success');
    }).catch(() => {
      showSnackbar('Failed to copy logs', 'error');
    });
  };

  const handleClearLogs = () => {
    debugLogger.clearLogs();
    setDebugLogs([]);
    showSnackbar('Logs cleared', 'success');
  };

  if (settingsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const nzbProvider = localSettings.find(p => p.type === 'nzb');

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <SettingsIcon sx={{ color: 'primary.main', fontSize: 26 }} />
          <Typography variant="h5" sx={{ color: '#fff' }}>SETTINGS</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Tooltip title="Discard changes and reload from disk">
            <Button
              startIcon={<RefreshIcon sx={{ fontSize: '1.125rem !important' }} />}
              onClick={fetchSettings}
              variant="outlined"
              size="small"
              sx={{ py: 0.5 }}
            >
              Reset
            </Button>
          </Tooltip>
          <Tooltip title="Save all changes to configuration">
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon sx={{ fontSize: '1.125rem !important' }} />}
              onClick={handleSave}
              disabled={saving}
              sx={{ py: 0.5 }}
            >
              Save Settings
            </Button>
          </Tooltip>
        </Box>
      </Box>

      <Paper sx={{ background: 'rgba(15, 23, 42, 0.3)', borderRadius: 1, overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.12)' }}>

        {/* Download Settings */}
        <Accordion 
          expanded={expanded === 'downloads'} 
          onChange={handleAccordionChange('downloads')}
          disableGutters 
          sx={{ 
            background: 'transparent', 
            boxShadow: 'none',
            '&:before': { display: 'none' }
          }}
        >
          <AccordionSummary 
            expandIcon={<ExpandMoreIcon sx={{ fontSize: '1.325rem' }} />}
            sx={{ 
              minHeight: 48,
              '& .MuiAccordionSummary-content': { my: 1.5 },
              '&.Mui-expanded': { minHeight: 48 }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FolderOpenIcon color="primary" sx={{ opacity: 0.8, fontSize: '1.225rem' }} />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Downloads</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, fontSize: '0.775rem' }}>
                    Choose where local downloads are saved
                  </Typography>
                </Box>
              </Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', p: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                label="Download Directory"
                size="small"
                value={downloadDirectory}
                onChange={(e) => setDownloadDirectory(e.target.value)}
                placeholder="e.g. C:\\Downloads"
                helperText="Leave blank to use the system default downloads folder"
                InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                inputProps={{ sx: { fontSize: '0.9375rem' } }}
              />
              <Tooltip title="Browse folders">
                <IconButton
                  onClick={() => setDirectoryPickerOpen(true)}
                  sx={{
                    mt: isMobile ? 0 : 0.5,
                    color: 'primary.main',
                    '&:hover': { backgroundColor: 'rgba(124, 58, 237, 0.1)' }
                  }}
                >
                  <FolderOpenIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

        {/* Auto Updates */}
        <Accordion
          expanded={expanded === 'updates'}
          onChange={handleAccordionChange('updates')}
          disableGutters
          sx={{
            background: 'transparent',
            boxShadow: 'none',
            '&:before': { display: 'none' }
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ fontSize: '1.325rem' }} />}
            sx={{
              minHeight: 48,
              '& .MuiAccordionSummary-content': { my: 1.5 },
              '&.Mui-expanded': { minHeight: 48 }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <UpdateIcon color="primary" sx={{ opacity: 0.8, fontSize: '1.225rem' }} />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Updates</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, fontSize: '0.775rem' }}>
                    Manage automatic updates
                  </Typography>
                </Box>
              </Box>
              {appVersion && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  v{appVersion}
                </Typography>
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', p: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoUpdate}
                  onChange={handleAutoUpdateChange}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontSize: '0.9375rem' }}>Automatically install updates</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.825rem' }}>
                    Checks GitHub releases and downloads updates
                  </Typography>
                </Box>
              }
            />

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleCheckForUpdate}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                startIcon={<RefreshIcon sx={{ fontSize: '1.125rem !important' }} />}
              >
                Check for Updates
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleQuitAndInstall}
                disabled={updateStatus !== 'downloaded'}
              >
                Install Update
              </Button>
            </Box>

            {updateMessage && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontSize: '0.825rem' }}>
                {updateMessage}
              </Typography>
            )}

            {updateStatus === 'downloading' && (
              <LinearProgress
                variant="determinate"
                value={updateProgress}
                sx={{ mt: 1, height: 6, borderRadius: 999 }}
              />
            )}
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

        {/* NZB Provider */}
        <Accordion 
          expanded={expanded === 'nzb'} 
          onChange={handleAccordionChange('nzb')}
          disableGutters 
          sx={{ 
            background: 'transparent', 
            boxShadow: 'none',
            '&:before': { display: 'none' }
          }}
        >
          <AccordionSummary 
            expandIcon={<ExpandMoreIcon sx={{ fontSize: '1.325rem' }} />}
            sx={{ 
              minHeight: 48,
              '& .MuiAccordionSummary-content': { my: 1.5 },
              '&.Mui-expanded': { minHeight: 48 }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CloudIcon color="primary" sx={{ opacity: 0.8, fontSize: '1.225rem' }} />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>NZB Indexers</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, fontSize: '0.775rem' }}>
                    Configure search indexers for NZB files
                  </Typography>
                </Box>
              </Box>
              <FormControlLabel
                control={
                  <Switch 
                    checked={nzbProvider?.enabled ?? false} 
                    onChange={(e) => { 
                      e.stopPropagation(); 
                      handleProviderToggle('nzb'); 
                    }} 
                    size="small"
                  />
                }
                label={<Typography variant="body2" sx={{ fontSize: '0.875rem' }}>{nzbProvider?.enabled ? "Enabled" : "Disabled"}</Typography>}
                onClick={(e) => e.stopPropagation()}
                sx={{ mr: 0 }}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', p: 3 }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                startIcon={<AddIcon sx={{ fontSize: '1.125rem !important' }} />}
                onClick={addIndexer}
                variant="outlined"
                size="small"
                sx={{ py: 0.25, fontSize: '0.825rem' }}
              >
                Add Indexer
              </Button>
            </Box>

            {isMobile ? (
              <Box>
                {nzbProvider?.indexers?.map((indexer: IndexerConfig) => (
                  <Paper
                    key={indexer.id}
                    sx={{
                      p: 2,
                      mb: 2,
                      background: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid rgba(148, 163, 184, 0.12)',
                      position: 'relative',
                    }}
                  >
                    <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeIndexer(indexer.id)}
                        sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                      >
                        <DeleteIcon sx={{ fontSize: '1.125rem' }} />
                      </IconButton>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        fullWidth
                        label="Name"
                        size="small"
                        variant="outlined"
                        value={indexer.name}
                        onChange={(e) => handleIndexerChange(indexer.id, 'name', e.target.value)}
                        placeholder="e.g. NZBGeek"
                        InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                        inputProps={{ sx: { fontSize: '0.9375rem' } }}
                      />
                      <TextField
                        fullWidth
                        label="API URL"
                        size="small"
                        variant="outlined"
                        value={indexer.url}
                        onChange={(e) => handleIndexerChange(indexer.id, 'url', e.target.value)}
                        placeholder="https://api.nzbgeek.info"
                        InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                        inputProps={{ sx: { fontSize: '0.9375rem' } }}
                      />
                      <TextField
                        fullWidth
                        label="API Key"
                        size="small"
                        variant="outlined"
                        type="password"
                        value={indexer.apiKey}
                        onChange={(e) => handleIndexerChange(indexer.id, 'apiKey', e.target.value)}
                        placeholder="Your API Key"
                        InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                        inputProps={{ sx: { fontSize: '0.9375rem' } }}
                      />
                    </Box>
                  </Paper>
                ))}
                {(!nzbProvider?.indexers || nzbProvider.indexers.length === 0) && (
                  <Typography align="center" sx={{ py: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
                    No indexers configured.
                  </Typography>
                )}
              </Box>
            ) : (
              <TableContainer component={Box} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 1 }}>
                <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.05)' } }}>
                  <TableHead sx={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <TableRow sx={{ '& th': { borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontSize: '0.725rem', letterSpacing: '0.05em' } }}>
                      <TableCell>Name</TableCell>
                      <TableCell>API URL</TableCell>
                      <TableCell>API Key</TableCell>
                      <TableCell align="right" sx={{ width: 40 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nzbProvider?.indexers?.map((indexer: IndexerConfig) => (
                      <TableRow key={indexer.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.01)' } }}>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            variant="standard"
                            value={indexer.name}
                            onChange={(e) => handleIndexerChange(indexer.id, 'name', e.target.value)}
                            placeholder="e.g. NZBGeek"
                            InputProps={{ disableUnderline: true, sx: { fontSize: '0.9375rem' } }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            variant="standard"
                            value={indexer.url}
                            onChange={(e) => handleIndexerChange(indexer.id, 'url', e.target.value)}
                            placeholder="https://api.nzbgeek.info"
                            InputProps={{ disableUnderline: true, sx: { fontSize: '0.9375rem' } }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            variant="standard"
                            type="password"
                            value={indexer.apiKey}
                            onChange={(e) => handleIndexerChange(indexer.id, 'apiKey', e.target.value)}
                            placeholder="Your API Key"
                            InputProps={{ disableUnderline: true, sx: { fontSize: '0.9375rem' } }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" color="error" onClick={() => removeIndexer(indexer.id)} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                            <DeleteIcon sx={{ fontSize: '1.225rem' }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!nzbProvider?.indexers || nzbProvider.indexers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
                          No indexers configured.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

        {/* Newsreaders */}
        <Accordion 
          expanded={expanded === 'newsreaders'} 
          onChange={handleAccordionChange('newsreaders')}
          disableGutters 
          sx={{ 
            background: 'transparent', 
            boxShadow: 'none',
            '&:before': { display: 'none' }
          }}
        >
          <AccordionSummary 
            expandIcon={<ExpandMoreIcon sx={{ fontSize: '1.325rem' }} />}
            sx={{ 
              minHeight: 48,
              '& .MuiAccordionSummary-content': { my: 1.5 },
              '&.Mui-expanded': { minHeight: 48 }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorageIcon color="primary" sx={{ opacity: 0.8, fontSize: '1.225rem' }} />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Newsreaders</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, fontSize: '0.775rem' }}>
                    Configure SABnzbd or NZBGet download clients
                  </Typography>
                </Box>
              </Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', p: 3 }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                startIcon={<AddIcon sx={{ fontSize: '1.125rem !important' }} />}
                onClick={addNewsreader}
                variant="outlined"
                size="small"
                sx={{ py: 0.25, fontSize: '0.825rem' }}
              >
                Add Newsreader
              </Button>
            </Box>

            {nzbProvider?.newsreaders?.map((nr) => (
              <Box key={nr.id} sx={{ 
                mb: 3, 
                p: 2.5, 
                borderRadius: 1, 
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(148, 163, 184, 0.12)',
                position: 'relative',
                transition: 'all 0.2s ease',
                '&:hover': {
                  background: 'rgba(30, 41, 59, 0.6)',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                }
              }}>
                <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
                  <IconButton size="small" color="error" onClick={() => removeNewsreader(nr.id)} sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}>
                    <DeleteIcon sx={{ fontSize: '1.125rem' }} />
                  </IconButton>
                </Box>

                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={nr.enabled}
                          onChange={() => handleNewsreaderToggle(nr.id)}
                        />
                      }
                      label={<Typography variant="body2" sx={{ fontSize: '0.875rem' }}>Enabled</Typography>}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      label="Name"
                      size="small"
                      value={nr.name}
                      onChange={(e) => handleNewsreaderChange(nr.id, 'name', e.target.value)}
                      placeholder="e.g. My SABnzbd"
                      InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                      inputProps={{ sx: { fontSize: '0.9375rem' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel sx={{ fontSize: '0.875rem' }}>Type</InputLabel>
                      <Select
                        value={nr.type}
                        label="Type"
                        onChange={(e) => handleNewsreaderChange(nr.id, 'type', e.target.value)}
                        sx={{ fontSize: '0.9375rem' }}
                      >
                        <MenuItem value="sabnzbd" sx={{ fontSize: '0.9375rem' }}>SABnzbd</MenuItem>
                        <MenuItem value="nzbget" sx={{ fontSize: '0.9375rem' }}>NZBGet</MenuItem>
                        <MenuItem value="direct" sx={{ fontSize: '0.9375rem' }}>Direct Usenet</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      label="Priority"
                      type="number"
                      size="small"
                      value={nr.priority}
                      onChange={(e) => handleNewsreaderChange(nr.id, 'priority', parseInt(e.target.value) || 0)}
                      InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                      inputProps={{ sx: { fontSize: '0.9375rem' } }}
                    />
                  </Grid>

                  {nr.type === 'direct' ? (
                    <>
                      <Grid size={{ xs: 12, md: 5 }}>
                        <TextField
                          fullWidth
                          label="Hostname"
                          size="small"
                          value={nr.hostname || ''}
                          onChange={(e) => handleNewsreaderChange(nr.id, 'hostname', e.target.value)}
                          placeholder="news.example.com"
                          InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                          inputProps={{ sx: { fontSize: '0.9375rem' } }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <TextField
                          fullWidth
                          label="Port"
                          type="number"
                          size="small"
                          value={nr.port || 563}
                          onChange={(e) => handleNewsreaderChange(nr.id, 'port', parseInt(e.target.value) || 0)}
                          InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                          inputProps={{ sx: { fontSize: '0.9375rem' } }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={nr.useSSL ?? true}
                              onChange={(e) => handleNewsreaderChange(nr.id, 'useSSL', e.target.checked)}
                            />
                          }
                          label={<Typography variant="body2" sx={{ fontSize: '0.875rem' }}>Use SSL/TLS</Typography>}
                        />
                      </Grid>
                    </>
                  ) : (
                    <>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          fullWidth
                          label="URL"
                          size="small"
                          value={nr.url}
                          onChange={(e) => handleNewsreaderChange(nr.id, 'url', e.target.value)}
                          placeholder="http://localhost:8080"
                          InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                          inputProps={{ sx: { fontSize: '0.9375rem' } }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          fullWidth
                          label="API Key / Password"
                          type="password"
                          size="small"
                          value={nr.apiKey}
                          onChange={(e) => handleNewsreaderChange(nr.id, 'apiKey', e.target.value)}
                          InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                          inputProps={{ sx: { fontSize: '0.9375rem' } }}
                        />
                      </Grid>
                    </>
                  )}

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Username (Optional)"
                      size="small"
                      value={nr.username || ''}
                      onChange={(e) => handleNewsreaderChange(nr.id, 'username', e.target.value)}
                      InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                      inputProps={{ sx: { fontSize: '0.9375rem' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Password (Optional)"
                      type="password"
                      size="small"
                      value={nr.password || ''}
                      onChange={(e) => handleNewsreaderChange(nr.id, 'password', e.target.value)}
                      InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                      inputProps={{ sx: { fontSize: '0.9375rem' } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      label="Download Path"
                      size="small"
                      value={nr.downloadPath || ''}
                      onChange={(e) => handleNewsreaderChange(nr.id, 'downloadPath', e.target.value)}
                      placeholder="e.g. C:\Downloads"
                      InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                      inputProps={{ sx: { fontSize: '0.9375rem' } }}
                    />
                  </Grid>

                  {nr.type === 'direct' && (
                    <>
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
                            sx={{ 
                              minHeight: 40,
                              '& .MuiAccordionSummary-content': { my: 0.5 },
                              '&.Mui-expanded': { minHeight: 40 }
                            }}
                          >
                            <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                              Advanced Options
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                  fullWidth
                                  label="Max Connections"
                                  type="number"
                                  size="small"
                                  value={nr.maxConnections ?? 2}
                                  onChange={(e) => handleNewsreaderChange(nr.id, 'maxConnections', e.target.value)}
                                  InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                                  inputProps={{ sx: { fontSize: '0.9375rem' } }}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                  fullWidth
                                  label="Segment Concurrency"
                                  type="number"
                                  size="small"
                                  value={nr.segmentConcurrency ?? 10}
                                  onChange={(e) => handleNewsreaderChange(nr.id, 'segmentConcurrency', e.target.value)}
                                  InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                                  inputProps={{ sx: { fontSize: '0.9375rem' } }}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                  fullWidth
                                  label="Article Timeout (ms)"
                                  type="number"
                                  size="small"
                                  value={nr.articleTimeoutMs ?? 15000}
                                  onChange={(e) => handleNewsreaderChange(nr.id, 'articleTimeoutMs', e.target.value)}
                                  InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                                  inputProps={{ sx: { fontSize: '0.9375rem' } }}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                  fullWidth
                                  label="Retry Attempts"
                                  type="number"
                                  size="small"
                                  value={nr.retryAttempts ?? 3}
                                  onChange={(e) => handleNewsreaderChange(nr.id, 'retryAttempts', e.target.value)}
                                  InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                                  inputProps={{ sx: { fontSize: '0.9375rem' } }}
                                />
                              </Grid>
                              <Grid size={{ xs: 12 }}>
                                <TextField
                                  fullWidth
                                  label="Retry Backoff (ms)"
                                  type="number"
                                  size="small"
                                  value={nr.retryBackoffMs ?? 1000}
                                  onChange={(e) => handleNewsreaderChange(nr.id, 'retryBackoffMs', e.target.value)}
                                  InputLabelProps={{ sx: { fontSize: '0.875rem' } }}
                                  inputProps={{ sx: { fontSize: '0.9375rem' } }}
                                />
                              </Grid>
                            </Grid>
                          </AccordionDetails>
                        </Accordion>
                      </Grid>

                      <Grid size={{ xs: 12 }}>
                        <Box sx={{ 
                          mt: 1.5,
                          p: 1,
                          borderRadius: 1,
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 1 }}>
                            Fallback Providers
                          </Typography>
                          {nzbProvider?.newsreaders?.filter(other => other.type === 'direct' && other.id !== nr.id).length === 0 ? (
                            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                              No other direct providers configured
                            </Typography>
                          ) : (
                            nzbProvider?.newsreaders?.filter(other => other.type === 'direct' && other.id !== nr.id).map(other => (
                              <FormControlLabel
                                key={other.id}
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={(nr.fallbackProviderIds || []).includes(other.id)}
                                    onChange={() => handleFallbackProviderToggle(other.id, nr.id)}
                                    sx={{ py: 0.25 }}
                                  />
                                }
                                label={<Typography sx={{ fontSize: '0.9375rem' }}>{other.name || `Direct Provider ${other.id.slice(0, 8)}`}</Typography>}
                              />
                            ))
                          )}
                        </Box>
                      </Grid>
                    </>
                  )}
                </Grid>
              </Box>
            ))}

            {(!nzbProvider?.newsreaders || nzbProvider.newsreaders.length === 0) && (
              <Typography align="center" sx={{ py: 2, color: 'text.secondary', fontStyle: 'italic', fontSize: '0.875rem' }}>
                No newsreaders configured.
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

        <Accordion
            expanded={expanded === 'debug'}
            onChange={handleAccordionChange('debug')}
            disableGutters
            sx={{
              background: 'transparent',
              boxShadow: 'none',
              '&:before': { display: 'none' }
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ fontSize: '1.325rem' }} />}
              sx={{
                minHeight: 48,
                '& .MuiAccordionSummary-content': { my: 1.5 },
                '&.Mui-expanded': { minHeight: 48 }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', pr: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BugReportIcon color="primary" sx={{ opacity: 0.8, fontSize: '1.225rem' }} />
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Debug</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.25, fontSize: '0.775rem' }}>
                      View debug information and logs
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ borderTop: '1px solid rgba(255,255,255,0.05)', p: 3 }}>
              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 2 }}>
                  System Information
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>App Version</Typography>
                    <Typography sx={{ fontSize: '0.9375rem' }}>{appVersion || 'Unknown'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Platform</Typography>
                    <Typography sx={{ fontSize: '0.9375rem' }}>{platform}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Build</Typography>
                    <Typography sx={{ fontSize: '0.9375rem' }}>debug</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Network</Typography>
                    <Typography sx={{ fontSize: '0.9375rem' }}>{networkStatus}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Last Updated</Typography>
                    <Typography sx={{ fontSize: '0.9375rem' }}>{lastUpdated || 'Never'}</Typography>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyIcon sx={{ fontSize: '1.125rem !important' }} />}
                  onClick={handleCopyLogs}
                  disabled={debugLogs.length === 0}
                >
                  Copy Logs
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DeleteIcon sx={{ fontSize: '1.125rem !important' }} />}
                  onClick={handleClearLogs}
                  disabled={debugLogs.length === 0}
                >
                  Clear Logs
                </Button>
              </Box>

              <Box
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: 1,
                  p: 2,
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                  maxHeight: 400,
                  overflow: 'auto',
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {debugLogs.length > 0 ? (
                  debugLogs.map((log, index) => (
                    <Box
                      key={index}
                      sx={{
                        color: log.includes('[ERROR]') ? '#f87171' : log.includes('[WARN]') ? '#fbbf24' : '#e2e8f0',
                        py: 0.25,
                        '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' }
                      }}
                    >
                      {log}
                    </Box>
                  ))
                ) : (
                  <Typography sx={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
                    No logs available
                  </Typography>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
      </Paper>

      <DirectoryPicker
        open={directoryPickerOpen}
        onClose={() => setDirectoryPickerOpen(false)}
        onSelect={(path) => {
          setDownloadDirectory(path);
          setDirectoryPickerOpen(false);
        }}
        initialPath={downloadDirectory}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity} 
          variant="filled"
          sx={{ 
            width: '100%', 
            fontSize: '0.875rem', 
            fontWeight: 700,
            borderRadius: 1,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            py: 0,
            '& .MuiAlert-icon': { fontSize: '1.325rem', py: 0.5 }
          }}
        >
          {snackbar.message.toUpperCase()}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SettingsPanel;
