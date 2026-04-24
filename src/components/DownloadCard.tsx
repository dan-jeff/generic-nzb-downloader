import React from 'react';
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  FolderOpen as OpenIcon,
  Delete as DeleteIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material';
import { DownloadProgress } from '../electron';
import { formatBytes, formatDuration } from '../utils/format';
import { useCollapsedState, CollapseSignal } from '../hooks/useCollapsedState';

interface DownloadCardProps {
  download: DownloadProgress;
  isMobile: boolean;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteDisk: (id: string) => void;
  onOpenLocation: (path: string) => void;
  collapseSignal?: CollapseSignal | null;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'downloading': return '#4caf50'; // Green
    case 'paused': return '#ffb300';      // Amber/Yellow
    case 'queued': return '#00bcd4';      // Cyan
    case 'failed': return '#f44336';      // Red
    case 'completed': return '#4caf50';   // Green
    default: return '#94A3B8';
  }
};

const DownloadCard: React.FC<DownloadCardProps> = ({
  download,
  isMobile,
  onPause,
  onDelete,
  onDeleteDisk,
  onOpenLocation,
  collapseSignal,
}) => {
  const [isCollapsed, toggleCollapse] = useCollapsedState(download.id, collapseSignal);

  const remainingBytes = download.totalBytes - download.transferredBytes;
  const speed = download.speed || 0;
  const remainingSeconds = speed > 0 ? remainingBytes / speed : 0;
  const timeRemaining = formatDuration(remainingSeconds);

  return (
    <Paper
      sx={{
        p: isMobile ? 2 : 2.5,
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        cursor: 'default',
        '&:hover': {
          bgcolor: 'action.hover',
          borderColor: 'primary.main',
        }
      }}
    >
      {/* Title Bar (Clickable to toggle) */}
      <Box 
        onClick={toggleCollapse}
        sx={{ 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', // Align center for collapsed look
          mb: isMobile ? 2 : 1, 
          flexDirection: (!isCollapsed && isMobile) ? 'column' : 'row', 
          gap: (!isCollapsed && isMobile) ? 2 : 0,
        }}
      >
        {/* Title Content */}
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', wordBreak: 'break-word', fontSize: isMobile ? '0.875rem' : '0.9375rem', width: '100%' }}>
                    {download.filename}
                </Typography>
                
                {/* Show badges only if NOT collapsed */}
                {!isCollapsed && !isMobile && (
                    <>
                        <Chip
                            label={download.providerName}
                            size="small"
                            sx={{ height: 18, fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', bgcolor: 'action.hover', color: 'text.secondary', borderRadius: 0.5, px: 0.5 }}
                        />
                        <Typography variant="caption" sx={{ color: getStatusColor(download.status), fontWeight: 800, fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {download.status}
                        </Typography>
                    </>
                )}
            </Box>
             {/* Mobile Badges - Expanded Only */}
             {!isCollapsed && isMobile && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    <Chip
                        label={download.providerName}
                        size="small"
                        sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', bgcolor: 'action.hover', color: 'text.secondary', borderRadius: 0.5, px: 0.5 }}
                    />
                    <Typography variant="caption" sx={{ color: getStatusColor(download.status), fontWeight: 800, fontSize: '0.775rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {download.status}
                    </Typography>
                </Box>
            )}
        </Box>

        {/* Actions - Expanded Only */}
        {!isCollapsed && (
            <Box sx={{ display: 'flex', gap: 0.5, ml: isMobile ? 0 : 2, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}
                 onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking actions
            >
                <Tooltip title="Open Location">
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => onOpenLocation(download.path || download.filename)}
                    sx={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } }}
                >
                    <OpenIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title={download.status === 'paused' ? "Resume" : "Pause"}>
                <IconButton size={isMobile ? "medium" : "small"} onClick={() => onPause(download.id)} sx={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } }}>
                    {download.status === 'paused' ? <ResumeIcon sx={{ fontSize: isMobile ? 22 : 18 }} /> : <PauseIcon sx={{ fontSize: isMobile ? 22 : 18 }} />}
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                <IconButton size={isMobile ? "medium" : "small"} onClick={() => onDelete(download.id)} sx={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'action.hover' } }}>
                    <DeleteIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete from Disk">
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => onDeleteDisk(download.id)}
                    sx={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'action.hover' } }}
                >
                    <DeleteForeverIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
                </IconButton>
                </Tooltip>
            </Box>
        )}
      </Box>

      {/* Progress Bar (Always Visible) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={download.percent * 100}
            sx={{
              height: isMobile ? 6 : 4,
              borderRadius: 2,
              '& .MuiLinearProgress-bar': {
                borderRadius: 2,
                backgroundColor: getStatusColor(download.status),
              }
            }}
          />
        </Box>
        {/* Percentage - Expanded Only */}
        {!isCollapsed && (
            <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 800, minWidth: 32, fontSize: isMobile ? '0.875rem' : '0.825rem', textAlign: 'right' }}>
                {Math.round(download.percent * 100)}%
            </Typography>
        )}
      </Box>

      {/* Stats - Expanded Only */}
      {!isCollapsed && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1 : 0, alignItems: isMobile ? 'flex-start' : 'center' }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                {formatBytes(download.transferredBytes)} / {formatBytes(download.totalBytes)}
            </Typography>
            {/* Speed */}
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                {formatBytes(speed)}/s
            </Typography>
            {/* Time Remaining */}
            {speed > 0 && (
                 <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                    ETA: {timeRemaining}
                </Typography>
            )}
            </Box>
        </Box>
      )}
    </Paper>
  );
};

export default DownloadCard;
