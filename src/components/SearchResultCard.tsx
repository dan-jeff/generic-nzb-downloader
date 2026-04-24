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
        cursor: 'pointer',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        '&:hover': {
          bgcolor: 'action.hover',
          borderColor: 'secondary.main',
        },
      }}
    >
      {/* Header Row: Title + Primary Action/Expand */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        
        {/* Left: Title & Basic Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
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
               <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                {formatBytes(result.size)}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Right: Quick Action (Collapsed) or Expand Icon */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', height: '100%', pt: 0 }}>
            {!isExpanded ? (
                <IconButton
                    size="small"
                    onClick={(e) => handleAction(e, 'newsreader')}
                    sx={{
                        color: 'secondary.main',
                        '&:hover': { bgcolor: 'action.hover' }
                    }}
                >
                    <CloudDownloadIcon sx={{ fontSize: 20 }} />
                </IconButton>
            ) : (
                <CollapseIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
            )}
        </Box>
      </Box>

      {/* Expanded Details */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          
          {/* Metadata Grid */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>Size</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
                    {formatBytes(result.size)}
                </Typography>
            </Box>
            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>Date</Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {result.date}
                </Typography>
            </Box>
            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>Provider</Typography>
                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {result.source}
                </Typography>
            </Box>
             <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>Type</Typography>
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
              color="primary"
              startIcon={<DownloadIcon />}
              onClick={(e) => handleAction(e, 'local')}
              sx={{ py: 1, fontWeight: 600 }}
            >
              Download NZB
            </Button>
            <Button
              fullWidth
              variant="contained"
              color="secondary"
              startIcon={<CloudDownloadIcon />}
              onClick={(e) => handleAction(e, 'newsreader')}
              sx={{ py: 1, fontWeight: 600 }}
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
