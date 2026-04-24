import React from 'react';
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
import { useCollapsedState, CollapseSignal } from '../hooks/useCollapsedState';

interface HistoryCardProps {
  item: DownloadHistoryItem;
  isMobile: boolean;
  onDelete: (id: string) => void;
  onDeleteDisk: (id: string) => void;
  onOpenLocation: (path: string) => void;
  collapseSignal?: CollapseSignal | null;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  item,
  isMobile,
  onDelete,
  onDeleteDisk,
  onOpenLocation,
  collapseSignal,
}) => {
  const [isCollapsed, toggleCollapse] = useCollapsedState(item.id, collapseSignal);

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
          alignItems: 'center',
          mb: isMobile ? 2 : 1, 
          flexDirection: (!isCollapsed && isMobile) ? 'column' : 'row', 
          gap: (!isCollapsed && isMobile) ? 2 : 0,
        }}
      >
        {/* Title Content */}
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', wordBreak: 'break-word', fontSize: isMobile ? '0.875rem' : '0.9375rem', width: '100%' }}>
                    {item.filename}
                </Typography>
                
                {/* Badges - Expanded Only */}
                {!isCollapsed && !isMobile && (
                    <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 800, fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        COMPLETED
                    </Typography>
                )}
            </Box>
             {/* Mobile Badges - Expanded Only */}
             {!isCollapsed && isMobile && (
                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 800, fontSize: '0.775rem', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1, display: 'block' }}>
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
                    sx={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'action.hover' } }}
                >
                    <OpenIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete Record">
                <IconButton size={isMobile ? "medium" : "small"} onClick={() => onDelete(item.id)} sx={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28, color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'action.hover' } }}>
                    <DeleteIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
                </IconButton>
                </Tooltip>
                <Tooltip title="Delete from Disk">
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => onDeleteDisk(item.id)}
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
            value={100}
            color="success"
            sx={{
              height: isMobile ? 6 : 4,
              borderRadius: 2,
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
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: isMobile ? '0.825rem' : '0.775rem' }}>
                {new Date(item.timestamp).toLocaleDateString()}
            </Typography>
            </Box>
        </Box>
      )}
    </Paper>
  );
};

export default HistoryCard;
