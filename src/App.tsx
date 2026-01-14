import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  FiberManualRecord as ActiveIcon,
} from '@mui/icons-material';
import DownloadPanel from './components/DownloadPanel';
import SearchPanel from './components/SearchPanel';
import SettingsPanel from './components/SettingsPanel';
import { useDownloads } from './hooks/useDownloads';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <Box
      component="div"
      role="tabpanel"
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      sx={{
        height: '100%',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      {...other}
    >
      <Box sx={{ pt: 3, pb: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Box>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [appVersion, setAppVersion] = useState('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { activeDownloads, history } = useDownloads();

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.electron.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };
    fetchVersion();
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const activeCount = activeDownloads.length;

  return (
    <Container
      maxWidth={false}
      sx={{ py: 2, px: 2, height: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      {/* Professional Compact Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center', 
          mb: 3,
          gap: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <DownloadIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              letterSpacing: '0.05em', 
              fontWeight: 900, 
              fontSize: '1.25rem',
              textTransform: 'uppercase'
            }}
          >
            GENERIC NZB <Box component="span" sx={{ color: 'primary.main' }}>DOWNLOADER</Box>
          </Typography>
        </Box>

        {/* Downloads Widget */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ActiveIcon sx={{ fontSize: 8, color: activeCount > 0 ? 'primary.main' : 'text.secondary' }} />
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.75rem', letterSpacing: '0.02em' }}>
              {activeCount} ACTIVE
            </Typography>
          </Box>
          <Box sx={{ width: 1, height: 12, borderLeft: '1px solid', borderColor: 'divider' }} />
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.75rem', letterSpacing: '0.02em' }}>
            {history.length} DONE
          </Typography>

          {activeDownloads.length > 0 && !isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 1 }}>
              {activeDownloads.slice(0, 3).map((download) => (
                <Box key={download.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>•</Typography>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: 'text.primary', 
                      fontWeight: 600, 
                      maxWidth: 120, 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      fontSize: '0.7rem'
                    }}
                  >
                    {download.filename}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, fontSize: '0.7rem' }}>
                    {Math.round(download.percent * 100)}%
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {!isMobile && (
            <Chip 
              label={`v${appVersion || '...'}`} 
              size="small" 
              variant="outlined" 
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, borderColor: 'divider', ml: 1 }} 
            />
          )}
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          aria-label="navigation tabs"
          textColor="primary"
          indicatorColor="primary"
          sx={{ minHeight: 32 }}
        >
          <Tab 
            icon={<DownloadIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start" 
            label="Downloads" 
            sx={{ minHeight: 32 }}
          />
          <Tab 
            icon={<SearchIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start" 
            label="Search" 
            sx={{ minHeight: 32 }}
          />
          <Tab 
            icon={<SettingsIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start" 
            label="Settings" 
            sx={{ minHeight: 32 }}
          />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <CustomTabPanel value={activeTab} index={0}>
          <DownloadPanel />
        </CustomTabPanel>
        <CustomTabPanel value={activeTab} index={1}>
          <SearchPanel />
        </CustomTabPanel>
        <CustomTabPanel value={activeTab} index={2}>
          <SettingsPanel />
        </CustomTabPanel>
      </Box>
    </Container>
  );
}

export default App;
