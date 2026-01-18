import React, { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  IconButton,
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
  Add as AddIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
} from '@mui/icons-material';
import { useDownloads } from '../hooks/useDownloads';
import DownloadCard from './DownloadCard';
import HistoryCard from './HistoryCard';

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
  const [downloadsCollapseSignal, setDownloadsCollapseSignal] = useState<{ expanded: boolean; timestamp: number } | null>(null);

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

  const activeDownloadsFiltered = activeDownloads.filter(d => d.status.toLowerCase() !== 'completed');

  const handleToggleExpandAll = () => {
    setDownloadsCollapseSignal(prev => {
      const nextExpanded = prev ? !prev.expanded : true;
      return { expanded: nextExpanded, timestamp: Date.now() };
    });
  };

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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <ActiveIcon sx={{ color: 'primary.main', fontSize: isMobile ? 22 : 26 }} />
            <Typography variant="h5" sx={{ color: '#fff', fontSize: isMobile ? '1.25rem' : 'h5.fontSize' }}>DOWNLOADS</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {(activeDownloadsFiltered.length > 0 || history.length > 0) && (
              <Tooltip title={downloadsCollapseSignal?.expanded ? "Collapse All" : "Expand All"}>
                <IconButton
                  onClick={handleToggleExpandAll}
                  size={isMobile ? "medium" : "small"}
                  sx={{ 
                    color: 'rgba(255,255,255,0.3)', 
                    '&:hover': { color: 'primary.main', background: 'rgba(0, 188, 212, 0.1)' } 
                  }}
                >
                  {downloadsCollapseSignal?.expanded ? (
                    <CollapseAllIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
                  ) : (
                    <ExpandAllIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
                  )}
                </IconButton>
              </Tooltip>
            )}
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
      </Box>
 
      {/* Active Downloads */}
      {activeDownloadsFiltered.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, color: 'primary.main', fontWeight: 800, letterSpacing: '0.1em', fontSize: '0.775rem' }}>
            <ActiveIcon sx={{ fontSize: 14 }} /> ACTIVE DOWNLOADS
          </Typography>
          <List sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activeDownloadsFiltered.map((download) => (
              <DownloadCard
                key={download.id}
                download={download}
                isMobile={isMobile}
                onPause={pauseDownload}
                onDelete={deleteDownload}
                onDeleteDisk={setConfirmDeleteId}
                onOpenLocation={(path) => {
                  const electronBridge = getElectronBridge();
                  electronBridge?.openPath?.(path);
                }}
                collapseSignal={downloadsCollapseSignal}
              />
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
              <HistoryCard
                key={item.id}
                item={item}
                isMobile={isMobile}
                onDelete={deleteDownload}
                onDeleteDisk={setConfirmDeleteId}
                onOpenLocation={(path) => {
                  const electronBridge = getElectronBridge();
                  electronBridge?.openPath?.(path);
                }}
                collapseSignal={downloadsCollapseSignal}
              />
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
