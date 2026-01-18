import React, { useState, useEffect } from 'react';
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

interface DownloadCardProps {
  download: DownloadProgress;
  isMobile: boolean;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteDisk: (id: string) => void;
  onOpenLocation: (path: string) => void;
  collapseSignal?: { expanded: boolean; timestamp: number } | null;
}

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

const DownloadCard: React.FC<DownloadCardProps> = ({
  download,
  isMobile,
  onPause,
  onDelete,
  onDeleteDisk,
  onOpenLocation,
  collapseSignal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const collapsed = localStorage.getItem(`collapsed_${download.id}`);
    if (collapsed === 'true') {
      setIsCollapsed(true);
    }
  }, [download.id]);

  useEffect(() => {
    if (collapseSignal) {
      const shouldCollapse = !collapseSignal.expanded;
      setIsCollapsed(shouldCollapse);
      localStorage.setItem(`collapsed_${download.id}`, String(shouldCollapse));
    }
  }, [collapseSignal, download.id]);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(`collapsed_${download.id}`, String(newState));
  };

  const remainingBytes = download.totalBytes - download.transferredBytes;
  const speed = download.speed || 0;
  const remainingSeconds = speed > 0 ? remainingBytes / speed : 0;
  const timeRemaining = formatDuration(remainingSeconds);

  return (
    <Paper 
      sx={{ 
        p: isMobile ? 2 : 2.5, 
        background: 'rgba(30, 41, 59, 0.4)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: 1,
        transition: 'all 0.15s ease',
        cursor: 'default',
        '&:hover': {
          background: 'rgba(30, 41, 59, 0.6)',
          borderColor: 'rgba(0, 229, 255, 0.3)',
          transform: 'translateY(-1px)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
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
          mb: isCollapsed ? 1 : (isMobile ? 2 : 1), 
          flexDirection: (!isCollapsed && isMobile) ? 'column' : 'row', 
          gap: (!isCollapsed && isMobile) ? 2 : 0,
        }}
      >
        {/* Title Content */}
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', wordBreak: 'break-word', fontSize: isMobile ? '0.875rem' : '0.9375rem', width: '100%' }}>
                    {download.filename}
                </Typography>
                
                {/* Show badges only if NOT collapsed */}
                {!isCollapsed && !isMobile && (
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
             {/* Mobile Badges - Expanded Only */}
             {!isCollapsed && isMobile && (
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

        {/* Actions - Expanded Only */}
        {!isCollapsed && (
            <Box sx={{ display: 'flex', gap: 0.5, ml: isMobile ? 0 : 2, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}
                 onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking actions
            >
                <Tooltip title="Open Location">
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => onOpenLocation(download.path || download.filename)}
                    sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: 'primary.main', backgroundColor: 'rgba(0, 229, 255, 0.1)' } }}
                >
                    <OpenIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title={download.status === 'paused' ? "Resume" : "Pause"}>
                <IconButton size={isMobile ? "medium" : "small"} onClick={() => onPause(download.id)} sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: 'primary.main', backgroundColor: 'rgba(0, 229, 255, 0.1)' } }}>
                    {download.status === 'paused' ? <ResumeIcon sx={{ fontSize: isMobile ? 24 : 18 }} /> : <PauseIcon sx={{ fontSize: isMobile ? 24 : 18 }} />}
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                <IconButton size={isMobile ? "medium" : "small"} onClick={() => onDelete(download.id)} sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#ff4444', backgroundColor: 'rgba(255, 68, 68, 0.1)' } }}>
                    <DeleteIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete from Disk">
                <IconButton 
                    size={isMobile ? "medium" : "small"} 
                    onClick={() => onDeleteDisk(download.id)} 
                    sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#d32f2f', backgroundColor: 'rgba(211, 47, 47, 0.1)' } }}
                >
                    <DeleteForeverIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
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
              height: isCollapsed ? 4 : (isMobile ? 6 : 4),
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
