import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Chip,
  Collapse,
} from '@mui/material';
import {
  Download as DownloadIcon,
  CloudDownload as CloudDownloadIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import { SearchResult } from '../types/search';
import { formatBytes } from '../utils/format';

interface SearchResultCardProps {
  result: SearchResult;
  onDownload: (link: string, title: string, target: 'local' | 'newsreader') => void;
  collapseSignal?: { expanded: boolean; timestamp: number } | null;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({ result, onDownload, collapseSignal }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  React.useEffect(() => {
    if (collapseSignal) {
      setIsExpanded(collapseSignal.expanded);
    }
  }, [collapseSignal]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleAction = (e: React.MouseEvent, target: 'local' | 'newsreader') => {
    e.stopPropagation();
    onDownload(result.link, result.title, target);
  };

  return (
    <Paper
      onClick={handleToggle}
      sx={{
        p: 2,
        mb: 1.5,
        background: 'rgba(30, 41, 59, 0.4)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
          background: 'rgba(30, 41, 59, 0.6)',
          borderColor: 'rgba(139, 92, 246, 0.3)',
        },
      }}
    >
      {/* Header Row: Title + Primary Action/Expand */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        
        {/* Left: Title & Basic Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: 'rgba(255,255,255,0.95)',
              wordBreak: 'break-word',
              fontSize: '0.9rem',
              lineHeight: 1.3,
            }}
          >
            {result.title}
          </Typography>

          {/* Subtitle Line (Collapsed) */}
          {!isExpanded && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Chip
                label={result.type.toUpperCase()}
                size="small"
                variant="outlined"
                color="secondary"
                sx={{ 
                  height: 16, 
                  fontSize: '0.65rem', 
                  fontWeight: 700, 
                  '& .MuiChip-label': { px: 0.75 }
                }}
              />
               <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                {formatBytes(result.size)}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Right: Quick Action (Collapsed) or Expand Icon */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {!isExpanded ? (
                <IconButton 
                    size="small" 
                    onClick={(e) => handleAction(e, 'local')}
                    sx={{ 
                        color: 'primary.main',
                        background: 'rgba(0, 229, 255, 0.1)',
                        '&:hover': { background: 'rgba(0, 229, 255, 0.2)' }
                    }}
                >
                    <DownloadIcon sx={{ fontSize: 20 }} />
                </IconButton>
            ) : (
                <CollapseIcon sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }} />
            )}
        </Box>
      </Box>

      {/* Expanded Details */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          
          {/* Metadata Grid */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 0.5 }}>Size</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.9)' }}>
                    {formatBytes(result.size)}
                </Typography>
            </Box>
            <Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 0.5 }}>Date</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                    {result.date}
                </Typography>
            </Box>
            <Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 0.5 }}>Provider</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                    {result.source}
                </Typography>
            </Box>
             <Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 0.5 }}>Type</Typography>
                <Chip
                    label={result.type.toUpperCase()}
                    size="small"
                    variant="outlined"
                    color="secondary"
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                />
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={(e) => handleAction(e, 'local')}
              sx={{
                py: 1,
                background: 'linear-gradient(135deg, #00E5FF 0%, #00B4D8 100%)',
                color: '#0F172A',
                fontWeight: 700,
                '&:hover': {
                  background: 'linear-gradient(135deg, #00B4D8 0%, #00E5FF 100%)',
                },
              }}
            >
              Download NZB
            </Button>
            <Button
              fullWidth
              variant="contained"
              startIcon={<CloudDownloadIcon />}
              onClick={(e) => handleAction(e, 'newsreader')}
              sx={{
                py: 1,
                background: 'linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)',
                fontWeight: 700,
                '&:hover': {
                    background: 'linear-gradient(135deg, #7B1FA2 0%, #9C27B0 100%)',
                },
              }}
            >
              Send to Newsreader
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default SearchResultCard;
