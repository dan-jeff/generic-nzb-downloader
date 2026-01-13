import React, { useState, useMemo } from 'react';
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
} from '@mui/material';
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  CloudDownload as CloudDownloadIcon,
  FilterList as FilterIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { SearchResult } from '../types/search';
import { formatBytes } from '../utils/format';

type SortField = 'title' | 'size' | 'date' | 'source' | 'type';
type SortOrder = 'asc' | 'desc';
type SizeUnit = 'MB' | 'GB';

const SearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Filter states
  const [includeFilter, setIncludeFilter] = useState('');
  const [excludeFilter, setExcludeFilter] = useState('');
  const [minSize, setMinSize] = useState('');
  const [maxSize, setMaxSize] = useState('');
  const [minSizeUnit, setMinSizeUnit] = useState<SizeUnit>('MB');
  const [maxSizeUnit, setMaxSizeUnit] = useState<SizeUnit>('GB');

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    try {
      const searchResults = await window.electron.search(query);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSort = (field: SortField) => {
    const isAsc = sortField === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortField(field);
  };

  const handleDownload = (link: string, title: string, target?: 'local' | 'newsreader') => {
    window.electron.startDownload(link, target, title);
  };

  const filteredResults = useMemo(() => {
    let processed = results;
    
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
  }, [results, includeFilter, excludeFilter, minSize, maxSize, minSizeUnit, maxSizeUnit, sortField, sortOrder]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h5" sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 2 }}>
          <SearchIcon sx={{ color: 'primary.main', fontSize: 26 }} /> SEARCH
        </Typography>
      </Box>

      {/* Search Controls */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(145deg, #141B2D 0%, #0F172A 100%)' }}>
        <Box sx={{ display: 'flex', gap: 2.5 }}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            placeholder="Search for content..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            disabled={loading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleSearch}
            disabled={!query.trim() || loading}
            sx={{ px: 3, minWidth: '100px' }}
          >
            {loading ? <CircularProgress size={18} color="inherit" /> : 'Search'}
          </Button>
        </Box>

        {results.length > 0 && (
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
                  <FormControl size="small" sx={{ width: 80 }}>
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
                  <FormControl size="small" sx={{ width: 80 }}>
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

      {/* Results Table */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <Box
            sx={{
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>Searching providers...</Typography>
          </Box>
        ) : filteredResults.length > 0 ? (
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
        ) : (
          <Box
            sx={{
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
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
  );
};

export default SearchPanel;
