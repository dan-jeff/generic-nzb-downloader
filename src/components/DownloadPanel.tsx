import React, { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  List,
  IconButton,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material';

const getElectronBridge = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as any).electron as any | undefined;
};
import {
  DeleteSweep as ClearIcon,
  CheckCircle as CompletedIcon,
  FileDownload as ActiveIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  FolderOpen as OpenIcon,
  Delete as DeleteIcon,
  DeleteForever as DeleteForeverIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useDownloads } from '../hooks/useDownloads';
import { formatBytes } from '../utils/format';

  const DownloadPanel: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const { 
    activeDownloads, 
    history, 
    startDownload,
    clearHistory,
    pauseDownload,
    deleteDownload,
    deleteDownloadWithFiles,
  } = useDownloads();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.nzb')) {
      const buffer = await file.arrayBuffer();
      startDownload(buffer, 'newsreader', file.name);
    }
    // Reset value
    if (event.target) event.target.value = '';
  };

  const handleDrop = async (event: React.DragEvent) => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.nzb')) {
      const buffer = await file.arrayBuffer();
      startDownload(buffer, 'newsreader', file.name);
    }
  };

  const handleDragEnter = (event: React.DragEvent) => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }

    setIsDragging(false);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'downloading': return '#4caf50'; // Green
      case 'paused': return '#ffb300';      // Amber/Yellow
      case 'queued': return '#00bcd4';      // Cyan
      case 'failed': return '#f44336';      // Red
      case 'completed': return '#4caf50';   // Green
      default: return 'rgba(255,255,255,0.5)';
    }
  };

  const activeDownloadsFiltered = activeDownloads.filter(d => d.status.toLowerCase() !== 'completed');

  return (
    <Box 
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      sx={{ 
        height: '100%',
        position: 'relative',
        '&::after': !isMobile && isDragging ? {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: '2px dashed #00bcd4',
          borderRadius: 2,
          backgroundColor: 'rgba(0, 188, 212, 0.05)',
          pointerEvents: 'none',
          zIndex: 10,
        } : {},
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".nzb"
        onChange={handleFileUpload}
      />

      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <ActiveIcon sx={{ color: 'primary.main', fontSize: isMobile ? 22 : 26 }} />
          <Typography variant="h5" sx={{ color: '#fff', fontSize: isMobile ? '1.25rem' : 'h5.fontSize' }}>DOWNLOADS</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Tooltip title="Add NZB">
            <IconButton onClick={() => fileInputRef.current?.click()} size={isMobile ? "medium" : "small"} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#00bcd4', background: 'rgba(0, 188, 212, 0.1)' } }}>
              <AddIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear History">
            <IconButton onClick={clearHistory} size={isMobile ? "medium" : "small"} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ff4444', background: 'rgba(255, 68, 68, 0.1)' } }}>
              <ClearIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
 
      {/* Active Downloads */}
      {activeDownloadsFiltered.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, color: 'primary.main', fontWeight: 800, letterSpacing: '0.1em', fontSize: '0.775rem' }}>
            <ActiveIcon sx={{ fontSize: 14 }} /> ACTIVE DOWNLOADS
          </Typography>
          <List sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activeDownloadsFiltered.map((download) => (
              <Paper 
                key={download.id} 
                sx={{ 
                  p: isMobile ? 2 : 2.5, 
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  borderRadius: 1,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: isMobile ? 2 : 1, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 0 }}>
                  <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isMobile ? '0.875rem' : '0.9375rem', width: isMobile ? '100%' : 'auto' }}>
                        {download.filename}
                      </Typography>
                      {!isMobile && (
                        <>
                          <Chip 
                            label={download.providerName} 
                            size="small" 
                            sx={{ height: 16, fontSize: '0.675rem', fontWeight: 900, textTransform: 'uppercase', backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', borderRadius: 0.5, px: 0.5 }} 
                          />
                          <Typography variant="caption" sx={{ color: getStatusColor(download.status), fontWeight: 800, fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {download.status}
                          </Typography>
                        </>
                      )}
                    </Box>
                    {isMobile && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                        <Chip 
                          label={download.providerName} 
                          size="small" 
                          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', borderRadius: 0.5, px: 0.5 }} 
                        />
                        <Typography variant="caption" sx={{ color: getStatusColor(download.status), fontWeight: 800, fontSize: '0.775rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {download.status}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 0.5, ml: isMobile ? 0 : 2, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                      <Tooltip title="Open Location">
                        <IconButton
                          size={isMobile ? "medium" : "small"}
                          onClick={() => {
                            const electronBridge = getElectronBridge();
                            electronBridge?.openPath?.(download.path || download.filename);
                          }}
                          sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: 'primary.main', backgroundColor: 'rgba(0, 229, 255, 0.1)' } }}
                        >
                          <OpenIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                        </IconButton>
                      </Tooltip>
                    <Tooltip title={download.status === 'paused' ? "Resume" : "Pause"}>
                      <IconButton size={isMobile ? "medium" : "small"} onClick={() => pauseDownload(download.id)} sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: 'primary.main', backgroundColor: 'rgba(0, 229, 255, 0.1)' } }}>
                        {download.status === 'paused' ? <ResumeIcon sx={{ fontSize: isMobile ? 24 : 18 }} /> : <PauseIcon sx={{ fontSize: isMobile ? 24 : 18 }} />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size={isMobile ? "medium" : "small"} onClick={() => deleteDownload(download.id)} sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#ff4444', backgroundColor: 'rgba(255, 68, 68, 0.1)' } }}>
                        <DeleteIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete from Disk">
                      <IconButton 
                        size={isMobile ? "medium" : "small"} 
                        onClick={() => setConfirmDeleteId(download.id)} 
                        sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#d32f2f', backgroundColor: 'rgba(211, 47, 47, 0.1)' } }}
                      >
                        <DeleteForeverIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={download.percent * 100} 
                      sx={{ 
                        height: isMobile ? 6 : 4, 
                        borderRadius: 2,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          backgroundColor: getStatusColor(download.status),
                          boxShadow: `0 0 8px ${getStatusColor(download.status)}44`,
                        }
                      }} 
                    />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 800, minWidth: 32, fontSize: isMobile ? '0.875rem' : '0.825rem', textAlign: 'right' }}>
                    {Math.round(download.percent * 100)}%
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1 : 0, alignItems: isMobile ? 'flex-start' : 'center' }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                      {formatBytes(download.transferredBytes)} / {formatBytes(download.totalBytes)}
                    </Typography>
                    {download.speed && (
                      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                        {formatBytes(download.speed)}/s
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Paper>
            ))}
          </List>
        </Box>
      )}

      {/* History */}
      <Box>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, color: 'text.secondary', fontWeight: 800, letterSpacing: '0.1em', fontSize: '0.775rem' }}>
          <CompletedIcon sx={{ fontSize: 14 }} /> COMPLETED
        </Typography>
        {history.length === 0 ? (
          <Paper sx={{ background: 'rgba(255,255,255,0.01)', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', display: 'block', py: 3 }}>
              NO HISTORY
            </Typography>
          </Paper>
        ) : (
          <List sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {history.map((item) => (
              <Paper 
                key={item.id} 
                sx={{ 
                  p: isMobile ? 2 : 2.5, 
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  borderRadius: 1,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderColor: 'rgba(0, 229, 255, 0.3)',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                  }
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: isMobile ? 2 : 1, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 0 }}>
                  <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isMobile ? '0.875rem' : '0.9375rem', width: isMobile ? '100%' : 'auto' }}>
                        {item.filename}
                      </Typography>
                      {!isMobile && (
                        <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 800, fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          COMPLETED
                        </Typography>
                      )}
                    </Box>
                    {isMobile && (
                      <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 800, fontSize: '0.775rem', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, display: 'block' }}>
                        COMPLETED
                      </Typography>
                    )}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 0.5, ml: isMobile ? 0 : 2, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <Tooltip title="Open Location">
                      <IconButton
                        size={isMobile ? "medium" : "small"}
                        onClick={() => {
                          const electronBridge = getElectronBridge();
                          electronBridge?.openPath?.(item.path);
                        }}
                        sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: 'primary.main', backgroundColor: 'rgba(0, 229, 255, 0.1)' } }}
                      >
                        <OpenIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Record">
                      <IconButton size={isMobile ? "medium" : "small"} onClick={() => deleteDownload(item.id)} sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#ff4444', backgroundColor: 'rgba(255, 68, 68, 0.1)' } }}>
                        <DeleteIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete from Disk">
                      <IconButton 
                        size={isMobile ? "medium" : "small"} 
                        onClick={() => setConfirmDeleteId(item.id)} 
                        sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#d32f2f', backgroundColor: 'rgba(211, 47, 47, 0.1)' } }}
                      >
                        <DeleteForeverIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={100} 
                      sx={{ 
                        height: isMobile ? 6 : 4, 
                        borderRadius: 2,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          backgroundColor: '#4caf50',
                          boxShadow: '0 0 8px #4caf5044',
                        }
                      }} 
                    />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 800, minWidth: 32, fontSize: isMobile ? '0.875rem' : '0.825rem', textAlign: 'right' }}>
                    100%
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1 : 0, alignItems: isMobile ? 'flex-start' : 'center' }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                      {formatBytes(item.size)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                      {new Date(item.timestamp).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </List>
        )}
      </Box>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        PaperProps={{
          sx: {
            background: '#1e293b',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          }
        }}
      >
        <DialogTitle sx={{ color: '#fff' }}>
          Delete File from Disk?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Are you sure you want to permanently delete this file? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Cancel
          </Button>
          <Button 
            onClick={() => {
              if (confirmDeleteId) {
                deleteDownloadWithFiles(confirmDeleteId);
                setConfirmDeleteId(null);
              }
            }} 
            color="error" 
            variant="contained"
            autoFocus
          >
            Delete Forever
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DownloadPanel;
