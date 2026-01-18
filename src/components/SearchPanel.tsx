import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Tooltip,
  Chip,
  TableSortLabel,
  Select,
  MenuItem,
  FormControl,
  Grid,
  useMediaQuery,
  useTheme,
  Alert,
  Snackbar,
  Collapse,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Sort as SortIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  Check as CheckIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  CloudDownload as CloudDownloadIcon,
  FilterList as FilterIcon,
  Storage as StorageIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
} from '@mui/icons-material';
import { SearchResult } from '../types/search';
import { formatBytes } from '../utils/format';
import { useSearch } from '../hooks/useSearch';
import { useDownloads } from '../hooks/useDownloads';
import SearchResultCard from './SearchResultCard';

type SortField = 'title' | 'size' | 'date' | 'source' | 'type';
type SortOrder = 'asc' | 'desc';
type SizeUnit = 'MB' | 'GB';

interface SearchPanelProps {
  expandSignal?: number;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ expandSignal }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { search, loading: searching, error: searchError, isRetrying } = useSearch();
  const errorBody = searchError?.body;
  const { startDownload } = useDownloads();
  const [query, setQuery] = useState('');
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Search Card Collapse State
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false);
  const [resultsCollapseSignal, setResultsCollapseSignal] = useState<{ expanded: boolean; timestamp: number } | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sortMenuAnchor, setSortMenuAnchor] = useState<null | HTMLElement>(null);

  const [retryCountdown, setRetryCountdown] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Filter states
  const [includeFilter, setIncludeFilter] = useState('');
  const [excludeFilter, setExcludeFilter] = useState('');
  const [minSize, setMinSize] = useState('');
  const [maxSize, setMaxSize] = useState('');
  const [minSizeUnit, setMinSizeUnit] = useState<SizeUnit>('MB');
  const [maxSizeUnit, setMaxSizeUnit] = useState<SizeUnit>('GB');

  useEffect(() => {
    if (searchError?.retryAfter && searchError.retryAfter > 0) {
      setRetryCountdown(searchError.retryAfter);
    }
  }, [searchError?.retryAfter]);

  useEffect(() => {
    if (retryCountdown > 0) {
      const timer = setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [retryCountdown]);

  // Handle expand signal from parent (e.g. clicking Search tab while already on it)
  useEffect(() => {
    if (expandSignal && expandSignal > 0) {
      setIsSearchCollapsed(false);
    }
  }, [expandSignal]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    console.log('[SearchPanel] handleSearch called with query:', query);
    
    try {
      setHasSearched(true);
      const searchResults = await search(query);
      console.log('[SearchPanel] Search returned results:', searchResults.length);
      setAllResults(searchResults);
    } catch (error) {
      console.error('[SearchPanel] Search failed with error:', error);
      alert('Search error: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleRequestSort = (field: SortField) => {
    const isAsc = sortField === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortField(field);
  };

  const handleSortMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setSortMenuAnchor(event.currentTarget);
  };

  const handleSortMenuClose = () => {
    setSortMenuAnchor(null);
  };

  const handleSortSelect = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    handleSortMenuClose();
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleDownload = async (link: string, title: string, target?: 'local' | 'newsreader') => {
    try {
      await startDownload(link, target, title);
      showSnackbar(`Started download: ${title}`, 'success');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Download error:', error);
      showSnackbar(`Download failed: ${errorMsg}`, 'error');
    }
  };

  const filteredResults = useMemo(() => {
    let processed = allResults;

    // Include Filter
    if (includeFilter.trim()) {
      const terms = includeFilter.toLowerCase().trim().split(/\s+/).filter(Boolean);
      processed = processed.filter(item => 
        terms.every(term => item.title.toLowerCase().includes(term))
      );
    }

    // Exclude Filter
    if (excludeFilter.trim()) {
      const terms = excludeFilter.toLowerCase().trim().split(/\s+/).filter(Boolean);
      processed = processed.filter(item => 
        !terms.some(term => item.title.toLowerCase().includes(term))
      );
    }

    // Size Filter
    if (minSize || maxSize) {
      processed = processed.filter(item => {
        let matchesMin = true;
        let matchesMax = true;

        if (minSize) {
          const minBytes = parseFloat(minSize) * (minSizeUnit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024);
          if (!isNaN(minBytes)) {
            matchesMin = item.size >= minBytes;
          }
        }

        if (maxSize) {
          const maxBytes = parseFloat(maxSize) * (maxSizeUnit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024);
          if (!isNaN(maxBytes)) {
            matchesMax = item.size <= maxBytes;
          }
        }

        return matchesMin && matchesMax;
      });
    }

    return [...processed].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      // Numerical sort for size
      if (sortField === 'size') {
        return sortOrder === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
      }

      // Chronological sort for date
      if (sortField === 'date') {
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        return sortOrder === 'asc' ? aDate - bDate : bDate - aDate;
      }

      // Default string sort
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (aStr < bStr) return sortOrder === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allResults, includeFilter, excludeFilter, minSize, maxSize, minSizeUnit, maxSizeUnit, sortField, sortOrder]);

  const handleToggleExpandAll = () => {
    setResultsCollapseSignal(prev => {
      const nextExpanded = prev ? !prev.expanded : true;
      return { expanded: nextExpanded, timestamp: Date.now() };
    });
  };

  return (
    <>
      {console.log('[SearchPanel] Component render, searching:', searching, 'query:', query)}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <SearchIcon sx={{ color: 'primary.main', fontSize: 26 }} />
            <Typography variant="h5" sx={{ color: '#fff' }}>SEARCH</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {allResults.length > 0 && (
              <Tooltip title={resultsCollapseSignal?.expanded ? "Collapse Results" : "Expand Results"}>
                <IconButton
                  onClick={handleToggleExpandAll}
                  size={isMobile ? "medium" : "small"}
                  sx={{ 
                    color: 'rgba(255,255,255,0.3)', 
                    '&:hover': { color: 'primary.main', background: 'rgba(0, 188, 212, 0.1)' } 
                  }}
                >
                  {resultsCollapseSignal?.expanded ? (
                    <CollapseAllIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
                  ) : (
                    <ExpandAllIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
                  )}
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Sort Results">
              <IconButton 
                onClick={handleSortMenuOpen}
                size={isMobile ? "medium" : "small"}
                sx={{ 
                  color: 'rgba(255,255,255,0.3)', 
                  '&:hover': { color: 'primary.main', background: 'rgba(0, 188, 212, 0.1)' } 
                }}
              >
                <SortIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={isSearchCollapsed ? "Expand Search" : "Collapse Search"}>
              <IconButton 
                onClick={() => setIsSearchCollapsed(!isSearchCollapsed)}
                size={isMobile ? "medium" : "small"}
                sx={{ 
                  color: 'rgba(255,255,255,0.3)', 
                  '&:hover': { color: 'primary.main', background: 'rgba(0, 188, 212, 0.1)' } 
                }}
              >
                {isSearchCollapsed ? 
                  <ExpandIcon sx={{ fontSize: isMobile ? 26 : 22 }} /> : 
                  <CollapseIcon sx={{ fontSize: isMobile ? 26 : 22 }} />
                }
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Sort Menu */}
      <Menu
        anchorEl={sortMenuAnchor}
        open={Boolean(sortMenuAnchor)}
        onClose={handleSortMenuClose}
        PaperProps={{
          sx: {
            background: '#1e293b',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: 200,
          }
        }}
      >
        <MenuItem onClick={() => handleSortSelect('date')}>
          <ListItemText>Date</ListItemText>
          {sortField === 'date' && <ListItemIcon sx={{ minWidth: 'auto !important' }}><CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>}
        </MenuItem>
        <MenuItem onClick={() => handleSortSelect('size')}>
          <ListItemText>Size</ListItemText>
          {sortField === 'size' && <ListItemIcon sx={{ minWidth: 'auto !important' }}><CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>}
        </MenuItem>
        <MenuItem onClick={() => handleSortSelect('title')}>
          <ListItemText>Title</ListItemText>
          {sortField === 'title' && <ListItemIcon sx={{ minWidth: 'auto !important' }}><CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>}
        </MenuItem>
        <MenuItem onClick={() => handleSortSelect('source')}>
          <ListItemText>Provider</ListItemText>
          {sortField === 'source' && <ListItemIcon sx={{ minWidth: 'auto !important' }}><CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>}
        </MenuItem>
        
        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
        
        <MenuItem onClick={() => { setSortOrder('asc'); handleSortMenuClose(); }}>
          <ListItemText>Ascending</ListItemText>
          {sortOrder === 'asc' && <ListItemIcon sx={{ minWidth: 'auto !important' }}><CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>}
        </MenuItem>
        <MenuItem onClick={() => { setSortOrder('desc'); handleSortMenuClose(); }}>
          <ListItemText>Descending</ListItemText>
          {sortOrder === 'desc' && <ListItemIcon sx={{ minWidth: 'auto !important' }}><CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /></ListItemIcon>}
        </MenuItem>
      </Menu>

      {/* Search Controls */}
      <Collapse in={!isSearchCollapsed}>
        <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(145deg, #141B2D 0%, #0F172A 100%)' }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 9, md: 10 }}>
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                placeholder="Search for content..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                disabled={searching}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  sx: { height: 40 }
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3, md: 2 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleSearch}
                disabled={!query.trim() || searching}
                sx={{ 
                  height: 40,
                  whiteSpace: 'nowrap',
                  background: 'primary.main',
                  '&:hover': { background: 'primary.dark' }
                }}
              >
                {searching ? <CircularProgress size={20} color="inherit" /> : 'Search'}
              </Button>
            </Grid>
          </Grid>

          {allResults.length > 0 && (
            <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Grid container spacing={3}>
                {/* Include Filter */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    label="Include Terms"
                    placeholder="e.g. 1080p HDR"
                    value={includeFilter}
                    onChange={(e) => setIncludeFilter(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <FilterIcon sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                {/* Exclude Filter */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    label="Exclude Terms"
                    placeholder="e.g. CAM TS"
                    value={excludeFilter}
                    onChange={(e) => setExcludeFilter(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <FilterIcon sx={{ color: 'error.main', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                {/* Size Filters */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Min Size"
                      type="number"
                      value={minSize}
                      onChange={(e) => setMinSize(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <Select
                        value={minSizeUnit}
                        onChange={(e) => setMinSizeUnit(e.target.value as SizeUnit)}
                      >
                        <MenuItem value="MB">MB</MenuItem>
                        <MenuItem value="GB">GB</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Max Size"
                      type="number"
                      value={maxSize}
                      onChange={(e) => setMaxSize(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <Select
                        value={maxSizeUnit}
                        onChange={(e) => setMaxSizeUnit(e.target.value as SizeUnit)}
                      >
                        <MenuItem value="MB">MB</MenuItem>
                        <MenuItem value="GB">GB</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </Paper>
      </Collapse>

      {isRetrying && retryCountdown > 0 && (
        <Alert
          severity="warning"
          sx={{
            mb: 3,
            backgroundColor: 'rgba(237, 137, 54, 0.12)',
            color: 'rgba(255, 193, 7, 1)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            '& .MuiAlert-icon': {
              color: 'rgba(255, 193, 7, 1)',
            },
          }}
        >
          ⚠ Rate limited by indexer — retrying in {retryCountdown}s...
        </Alert>
      )}

      {/* Results Table or Cards */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {searching ? (
          <Box
            sx={{
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>Searching providers...</Typography>
          </Box>
        ) : searchError ? (
          <Box sx={{ textAlign: 'center', p: 3 }}>
            <Typography sx={{ color: 'error.main', mb: 2 }}>Error: {searchError.message}</Typography>
            {errorBody ? (
              <Box
                component="pre"
                sx={{
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 220,
                  overflow: 'auto',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 1,
                  p: 2,
                  mb: 2,
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.75rem',
                }}
              >
                {errorBody}
              </Box>
            ) : null}
            <Button
              variant="contained"
              size="small"
              onClick={handleSearch}
              sx={{ px: 3, minWidth: '120px' }}
            >
              Try Again
            </Button>
          </Box>
        ) : filteredResults.length > 0 ? (
          isMobile ? (
            <Box sx={{ overflowY: 'auto', height: '100%', pb: 2 }}>
              {filteredResults.map((result) => (
                <SearchResultCard 
                  key={result.id} 
                  result={result} 
                  onDownload={handleDownload} 
                  collapseSignal={resultsCollapseSignal}
                />
              ))}
            </Box>
          ) : (
            <TableContainer
              component={Paper}
              sx={{
                background: 'transparent',
                boxShadow: 'none',
                height: '100%',
                overflowY: 'auto',
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow
                    sx={{
                      '& th': {
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        pb: 1,
                        pt: 0,
                        fontWeight: 800,
                        color: 'rgba(255,255,255,0.3)',
                        textTransform: 'uppercase',
                        fontSize: '0.725rem',
                        letterSpacing: '0.05em',
                        backgroundColor: 'rgba(10, 15, 29, 0.98)',
                      },
                    }}
                  >
                    <TableCell sx={{ width: '100%' }}>
                      <TableSortLabel
                        active={sortField === 'title'}
                        direction={sortField === 'title' ? sortOrder : 'asc'}
                        onClick={() => handleRequestSort('title')}
                        sx={{
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                        }}
                      >
                        Title
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'size'}
                        direction={sortField === 'size' ? sortOrder : 'asc'}
                        onClick={() => handleRequestSort('size')}
                        sx={{
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                        }}
                      >
                        Size
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortField === 'date'}
                        direction={sortField === 'date' ? sortOrder : 'asc'}
                        onClick={() => handleRequestSort('date')}
                        sx={{
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                        }}
                      >
                        Date
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortField === 'source'}
                        direction={sortField === 'source' ? sortOrder : 'asc'}
                        onClick={() => handleRequestSort('source')}
                        sx={{
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                        }}
                      >
                        Provider
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortField === 'type'}
                        direction={sortField === 'type' ? sortOrder : 'asc'}
                        onClick={() => handleRequestSort('type')}
                        sx={{
                          '&.Mui-active': { color: 'primary.main' },
                          '&.Mui-active .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                        }}
                      >
                        Type
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredResults.map((result, index) => (
                    <TableRow
                      key={result.id}
                      sx={{
                        backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(148, 163, 184, 0.03)',
                        '&:hover': { backgroundColor: 'rgba(139, 92, 246, 0.08)' },
                        '& td': { borderBottom: '1px solid rgba(148, 163, 184, 0.06)', py: 0.75 },
                      }}
                    >
                      <TableCell
                        sx={{
                          width: '100%',
                          maxWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.9)' }}
                        >
                          {result.title}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="caption"
                          sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontWeight: 500 }}
                        >
                          {formatBytes(result.size)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                          {result.date}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                          {result.source}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={result.type.toUpperCase()}
                          size="small"
                          variant="outlined"
                          color="secondary"
                          sx={{ fontSize: '0.675rem', height: 16, fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.25 }}>
                          <Tooltip title="Download NZB file locally">
                            <IconButton
                              size="small"
                              onClick={() => handleDownload(result.link, result.title, 'local')}
                              sx={{ p: 0.5, color: 'primary.main', '&:hover': { background: 'rgba(0, 229, 255, 0.1)' } }}
                            >
                              <DownloadIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Send to Newsreader">
                            <IconButton
                              size="small"
                              onClick={() => handleDownload(result.link, result.title, 'newsreader')}
                              sx={{ p: 0.5, color: 'secondary.main', '&:hover': { background: 'rgba(156, 39, 176, 0.1)' } }}
                            >
                              <CloudDownloadIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )
        ) : (
          <Box
            sx={{
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              color: 'rgba(255,255,255,0.2)',
            }}
          >
            {hasSearched ? (
              <>
                <StorageIcon sx={{ fontSize: 62, mb: 2, opacity: 0.1 }} />
                <Typography>No results found for your search</Typography>
              </>
            ) : (
              <>
                <SearchIcon sx={{ fontSize: 62, mb: 2, opacity: 0.1 }} />
                <Typography>Search results will appear here</Typography>
              </>
            )}
          </Box>
        )}
      </Box>
      </Box>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default SearchPanel;
