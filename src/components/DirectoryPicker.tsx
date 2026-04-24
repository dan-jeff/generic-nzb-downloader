import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  Description as DescriptionIcon,
  ArrowUpward as ArrowUpwardIcon,
} from '@mui/icons-material';
import { serviceContainer } from '@/core/ServiceContainer';

interface DirectoryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

type FileSystemEntry = {
  name: string;
  type: 'file' | 'directory';
};

const DirectoryPicker: React.FC<DirectoryPickerProps> = ({
  open,
  onClose,
  onSelect,
  initialPath = '',
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      const fsAdapter = await serviceContainer.getFileSystemAdapter();
      const result = await fsAdapter.readdir(path);
      setEntries(result || []);
    } catch (err) {
      console.error('Failed to read directory:', err);
      setError(err instanceof Error ? err.message : 'Failed to read directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath);
      loadDirectory(initialPath);
    }
  }, [open, initialPath]);

  const handleNavigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      const parentPath = parts.slice(0, -1).join('/');
      const newPath = parts.length === 1 ? '' : parentPath;
      setCurrentPath(newPath);
      loadDirectory(newPath);
    }
  };

  const handleFolderClick = (name: string) => {
    const newPath = currentPath ? `${currentPath}/${name}` : name;
    setCurrentPath(newPath);
    loadDirectory(newPath);
  };

  const handleSelectCurrent = () => {
    onSelect(currentPath);
    onClose();
  };

  const formatBreadcrumbs = () => {
    if (!currentPath) return '/ (Root)';
    return `/${currentPath}`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backdropFilter: 'blur(12px)',
          border: '1px solid', borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 6,
        },
      }}
    >
      <DialogTitle
        sx={{
          py: 2,
          px: 2.5,
          borderBottom: '1px solid', borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <FolderOpenIcon sx={{ color: 'primary.main', fontSize: 24 }} />
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            color: 'text.primary',
          }}
        >
          Select Directory
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 0, minHeight: 400 }}>
        {error && (
          <Alert
            severity="error"
            sx={{
              mx: 2,
              mt: 2,
              mb: 0,
              bgcolor: 'error.main', color: 'error.contrastText',
              border: '1px solid', borderColor: 'error.main',
              color: 'error.main',
              fontSize: '0.875rem',
              '& .MuiAlert-icon': { color: 'error.main' },
            }}
          >
            {error}
          </Alert>
        )}

        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderBottom: '1px solid', borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.875rem',
              color: 'text.primary',
              fontWeight: 600,
              fontFamily: '"Inter", monospace',
              wordBreak: 'break-all',
            }}
          >
            {formatBreadcrumbs()}
          </Typography>
          <Button
            startIcon={<ArrowUpwardIcon sx={{ fontSize: 18 }} />}
            onClick={handleNavigateUp}
            disabled={!currentPath}
            size="small"
            variant="outlined"
            sx={{ py: 0.5, minWidth: 'auto' }}
          >
            Up
          </Button>
        </Box>

        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 8,
            }}
          >
            <CircularProgress size={32} />
          </Box>
        ) : (
          <List
            sx={{
              py: 0,
              maxHeight: 340,
              overflowY: 'auto',
              '&::-webkit-scrollbar': {
                width: 8,
              },
              '&::-webkit-scrollbar-track': {
                bgcolor: 'action.hover',
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'action.hover',
                borderRadius: 4,
                '&:hover': {
                  bgcolor: 'action.selected',
                },
              },
            }}
          >
            {entries.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                  {error ? 'Unable to load directory' : 'This directory is empty'}
                </Typography>
              </Box>
            ) : (
              entries.map((entry) => {
                const isDirectory = entry.type === 'directory';
                return (
                  <ListItem
                    key={entry.name}
                    onClick={() => isDirectory && handleFolderClick(entry.name)}
                    sx={{
                      px: 2.5,
                      py: 1,
                      borderBottom: '1px solid', borderColor: 'divider',
                      cursor: isDirectory ? 'pointer' : 'default',
                      '&:hover': isDirectory ? {
                        bgcolor: 'action.hover',
                      } : {},
                      opacity: isDirectory ? 1 : 0.4,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 40,
                        color: isDirectory ? 'primary.main' : 'text.secondary',
                      }}
                    >
                      {isDirectory ? (
                        <FolderIcon sx={{ fontSize: 22 }} />
                      ) : (
                        <DescriptionIcon sx={{ fontSize: 20 }} />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={entry.name}
                      primaryTypographyProps={{
                        sx: {
                          fontSize: '0.9375rem',
                          fontWeight: 500,
                          color: isDirectory ? 'text.primary' : 'text.secondary',
                        },
                      }}
                    />
                  </ListItem>
                );
              })
            )}
          </List>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 2.5,
          py: 2,
          borderTop: '1px solid', borderColor: 'divider',
          gap: 1,
        }}
      >
        <Button onClick={onClose} variant="outlined" size="small">
          Cancel
        </Button>
        <Button
          onClick={handleSelectCurrent}
          variant="contained"
          color="primary"
          size="small"
          disabled={!!error}
        >
          Select Current
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DirectoryPicker;
