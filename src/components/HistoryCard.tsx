import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  FolderOpen as OpenIcon,
  Delete as DeleteIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material';
import { DownloadHistoryItem } from '../electron';
import { formatBytes } from '../utils/format';

interface HistoryCardProps {
  item: DownloadHistoryItem;
  isMobile: boolean;
  onDelete: (id: string) => void;
  onDeleteDisk: (id: string) => void;
  onOpenLocation: (path: string) => void;
  collapseSignal?: { expanded: boolean; timestamp: number } | null;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  isMobile,
  onDelete,
  onDeleteDisk,
  onOpenLocation,
  collapseSignal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const collapsed = localStorage.getItem(`collapsed_${item.id}`);
    if (collapsed === 'true') {
      setIsCollapsed(true);
    }
  }, [item.id]);

  useEffect(() => {
    if (collapseSignal) {
      const shouldCollapse = !collapseSignal.expanded;
      setIsCollapsed(shouldCollapse);
      localStorage.setItem(`collapsed_${item.id}`, String(shouldCollapse));
    }
  }, [collapseSignal, item.id]);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(`collapsed_${item.id}`, String(newState));
  };

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
          alignItems: 'center',
          mb: isCollapsed ? 1 : (isMobile ? 2 : 1), 
          flexDirection: (!isCollapsed && isMobile) ? 'column' : 'row', 
          gap: (!isCollapsed && isMobile) ? 2 : 0,
        }}
      >
        {/* Title Content */}
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff', wordBreak: 'break-word', fontSize: isMobile ? '0.875rem' : '0.9375rem', width: '100%' }}>
                    {item.filename}
                </Typography>
                
                {/* Badges - Expanded Only */}
                {!isCollapsed && !isMobile && (
                    <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 800, fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        COMPLETED
                    </Typography>
                )}
            </Box>
             {/* Mobile Badges - Expanded Only */}
             {!isCollapsed && isMobile && (
                <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 800, fontSize: '0.775rem', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, display: 'block' }}>
                    COMPLETED
                </Typography>
            )}
        </Box>

        {/* Actions - Expanded Only */}
        {!isCollapsed && (
            <Box sx={{ display: 'flex', gap: 0.5, ml: isMobile ? 0 : 2, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}
                 onClick={(e) => e.stopPropagation()}
            >
                <Tooltip title="Open Location">
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => onOpenLocation(item.path)}
                    sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: 'primary.main', backgroundColor: 'rgba(0, 229, 255, 0.1)' } }}
                >
                    <OpenIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete Record">
                <IconButton size={isMobile ? "medium" : "small"} onClick={() => onDelete(item.id)} sx={{ width: isMobile ? 48 : 24, height: isMobile ? 48 : 24, color: 'text.secondary', '&:hover': { color: '#ff4444', backgroundColor: 'rgba(255, 68, 68, 0.1)' } }}>
                    <DeleteIcon sx={{ fontSize: isMobile ? 24 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete from Disk">
                <IconButton 
                    size={isMobile ? "medium" : "small"} 
                    onClick={() => onDeleteDisk(item.id)} 
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
            value={100} 
            sx={{ 
              height: isCollapsed ? 4 : (isMobile ? 6 : 4),
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
        {/* Percentage - Expanded Only */}
        {!isCollapsed && (
            <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 800, minWidth: 32, fontSize: isMobile ? '0.875rem' : '0.825rem', textAlign: 'right' }}>
                100%
            </Typography>
        )}
      </Box>

      {/* Stats - Expanded Only */}
      {!isCollapsed && (
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
      )}
    </Paper>
  );
};

export default HistoryCard;
