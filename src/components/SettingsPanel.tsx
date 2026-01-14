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
} from '@mui/material';
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
} from '@mui/icons-material';
import { SearchProviderSettings, IndexerConfig, NewsreaderSettings } from '../types/search';

const SettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<SearchProviderSettings[]>([]);
  const [downloadDirectory, setDownloadDirectory] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'downloaded'
  >('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [expanded, setExpanded] = useState<string | false>(false);

  useEffect(() => {
    fetchSettings();
    fetchUpdateInfo();

    const removeUpdateListener = window.electron.onUpdateStatus
      ? window.electron.onUpdateStatus((status) => {
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

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [searchSettings, downloadSettings] = await Promise.all([
        window.electron.getSearchSettings(),
        window.electron.getDownloadSettings(),
      ]);
      setSettings(searchSettings);
      setDownloadDirectory(downloadSettings?.downloadDirectory || '');
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      showSnackbar('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchUpdateInfo = async () => {
    try {
      const [version, autoUpdateEnabled] = await Promise.all([
        window.electron.getAppVersion(),
        window.electron.getAutoUpdate(),
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
      const [searchSaved, downloadSaved] = await Promise.all([
        window.electron.updateSearchSettings(settings),
        window.electron.updateDownloadSettings({ downloadDirectory }),
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

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleAutoUpdateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setAutoUpdate(enabled);
    window.electron.setAutoUpdate(enabled);
  };

  const handleCheckForUpdate = () => {
    setUpdateStatus('checking');
    setUpdateMessage('Checking for updates...');
    window.electron.checkForUpdate();
  };

  const handleQuitAndInstall = () => {
    window.electron.quitAndInstall();
  };

  const handleIndexerChange = (indexerId: string, field: keyof IndexerConfig, value: string | boolean) => {
    setSettings(prev =>
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

    setSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb') {
          return {
            ...p,
            indexers: [...(p.indexers || []), newIndexer],
          };
        }
        return p;
      })
    );
  };

  const removeIndexer = (id: string) => {
    setSettings(prev =>
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
    setSettings(prev =>
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
    
    setSettings(prev =>
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
    setSettings(prev =>
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

    setSettings(prev =>
      prev.map(p => {
        if (p.type === 'nzb') {
          return {
            ...p,
            newsreaders: [...(p.newsreaders || []), newNewsreader],
          };
        }
        return p;
      })
    );
  };

  const removeNewsreader = (id: string) => {
    setSettings(prev =>
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const nzbProvider = settings.find(p => p.type === 'nzb');

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 2 }}>
          <SettingsIcon sx={{ color: 'primary.main', fontSize: 26 }} /> SETTINGS
        </Typography>
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
                  {nzbProvider?.indexers?.map((indexer) => (
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
      </Paper>

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
