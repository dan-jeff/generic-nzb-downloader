import React, { useRef, useState } from 'react';
import {
  Box,
  Typography,
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
import PullToRefresh from './PullToRefresh';
import { getElectronBridge } from '../utils/platform';

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
    refreshHistory,
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

  const handleRefresh = async () => {
    await refreshHistory();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
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
          bgcolor: 'action.hover',
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
            <Typography variant="h5" sx={{ color: 'text.primary', fontSize: isMobile ? '1.25rem' : 'h5.fontSize' }}>DOWNLOADS</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {(activeDownloadsFiltered.length > 0 || history.length > 0) && (
              <Tooltip title={downloadsCollapseSignal?.expanded ? "Collapse All" : "Expand All"}>
                <IconButton
                  onClick={handleToggleExpandAll}
                  size={isMobile ? "medium" : "small"}
                  sx={{ 
                    color: 'text.disabled', 
                    '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } 
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
              <IconButton onClick={() => fileInputRef.current?.click()} size={isMobile ? "medium" : "small"} sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } }}>
                <AddIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear History">
              <IconButton onClick={clearHistory} size={isMobile ? "medium" : "small"} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: 'action.hover' } }}>
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
      {history.length > 0 && (
        <Box>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, color: 'text.secondary', fontWeight: 800, letterSpacing: '0.1em', fontSize: '0.775rem' }}>
            <CompletedIcon sx={{ fontSize: 14 }} /> COMPLETED
          </Typography>
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
        </Box>
      )}

      {/* Empty state — matches SearchPanel's style + placement */}
      {activeDownloadsFiltered.length === 0 && history.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            flex: 1,
            minHeight: 240,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'text.disabled',
          }}
        >
          <CompletedIcon sx={{ fontSize: 62, mb: 2, opacity: 0.1 }} />
          <Typography>Downloaded files will appear here</Typography>
        </Box>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid', borderColor: 'divider',
          }
        }}
      >
        <DialogTitle sx={{ color: 'text.primary' }}>
          Delete File from Disk?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.primary' }}>
            Are you sure you want to permanently delete this file? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)} sx={{ color: 'text.secondary' }}>
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
    </PullToRefresh>
  );
};

export default DownloadPanel;
