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
  BottomNavigation,
  BottomNavigationAction,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  FiberManualRecord as ActiveIcon,
} from '@mui/icons-material';
import DownloadPanel from './components/DownloadPanel';
import SearchPanel from './components/SearchPanel';
import SettingsPanel, { SettingsPanelHandle } from './components/SettingsPanel';
import { useDownloads } from './hooks/useDownloads';
import { serviceContainer } from '@/core/ServiceContainer';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

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
  console.log('GenericDownloader: App component rendering');
  const [activeTab, setActiveTab] = useState(0);
  const [appVersion, setAppVersion] = useState('');
  const [searchExpandTimestamp, setSearchExpandTimestamp] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { activeDownloads, history } = useDownloads();
  const settingsRef = React.useRef<SettingsPanelHandle>(null);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Back Button Logic
    const backButtonListener = CapacitorApp.addListener('backButton', () => {
      // 1. If Settings is active, let it handle the back action
      if (activeTab === 2 && settingsRef.current?.handleBack()) {
        return;
      }

      // 2. If browser history exists (unlikely in this single-page layout but safe to check)
      /* 
         Note: We typically don't use window.history.back() here because 
         we are managing tabs manually. 
      */

      // 3. If not on the first tab, go to first tab
      if (activeTab !== 0) {
        setActiveTab(0);
        return;
      }

      // 4. If on first tab, exit app
      CapacitorApp.exitApp();
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [activeTab]);

  useEffect(() => {
    const initializeServices = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          try {
            await StatusBar.setStyle({ style: Style.Dark });
          } catch (e) {
            console.error('Failed to set status bar style', e);
          }
        }

        await serviceContainer.getNetworkAdapter();
        await serviceContainer.getFileSystemAdapter();
        await serviceContainer.getStorageAdapter();
        await serviceContainer.getDownloadManager();
        await serviceContainer.getSearchManager();
      } catch (error) {
        console.error('Failed to initialize services:', error);
      }
    };

    const fetchVersion = async () => {
      try {
        const electronBridge = typeof window !== 'undefined' ? (window as any).electron : undefined;
        if (!electronBridge?.getAppVersion) {
          return;
        }
        const version = await electronBridge.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };

    initializeServices();
    fetchVersion();
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const activeCount = activeDownloads.length;

  const handleSwipe = React.useCallback((direction: 'left' | 'right') => {
    setActiveTab((prev) => {
      const next = direction === 'left' ? prev + 1 : prev - 1;
      if (next < 0 || next > 2) return prev;
      return next;
    });
  }, []);

  const handleTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    touchStartRef.current = null;

    const horizontalThreshold = 60;
    const verticalThreshold = 40;

    if (Math.abs(deltaX) < horizontalThreshold || Math.abs(deltaY) > verticalThreshold) {
      return;
    }

    if (deltaX < 0) {
      handleSwipe('left');
    } else {
      handleSwipe('right');
    }
  }, [handleSwipe]);

  return (
    <Container
      maxWidth={false}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      sx={{ 
        pt: { xs: 'calc(env(safe-area-inset-top) + 16px)', sm: 'calc(env(safe-area-inset-top) + 24px)' },
        pb: 'env(safe-area-inset-bottom)',
        pl: { xs: 'max(16px, env(safe-area-inset-left))', sm: 3 },
        pr: { xs: 'max(16px, env(safe-area-inset-right))', sm: 3 },
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}
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
          <DownloadIcon sx={{ fontSize: isMobile ? 24 : 28, color: 'primary.main' }} />
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              letterSpacing: '0.05em', 
              fontWeight: 900, 
              fontSize: isMobile ? '1rem' : '1.25rem',
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

      <Box sx={{ borderBottom: 1, borderColor: 'divider', display: isMobile ? 'none' : 'block' }}>
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
            onClick={() => {
              if (activeTab === 1) {
                setSearchExpandTimestamp(Date.now());
              }
            }}
          />
          <Tab 
            icon={<SettingsIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start" 
            label="Settings" 
            sx={{ minHeight: 32 }}
          />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, pb: isMobile ? 'calc(56px + env(safe-area-inset-bottom))' : 0 }}>
        <CustomTabPanel value={activeTab} index={0}>
          <DownloadPanel />
        </CustomTabPanel>
        <CustomTabPanel value={activeTab} index={1}>
          <SearchPanel expandSignal={searchExpandTimestamp} />
        </CustomTabPanel>
        <CustomTabPanel value={activeTab} index={2}>
          <SettingsPanel ref={settingsRef} />
        </CustomTabPanel>
      </Box>

      <BottomNavigation
        value={activeTab}
        onChange={handleTabChange}
        showLabels
        sx={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0,
          display: isMobile ? 'flex' : 'none',
          zIndex: 1000,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
          height: 'auto',
          '& .MuiBottomNavigationAction-root': {
            minWidth: 'auto',
            padding: '6px 0'
          }
        }}
      >
        <BottomNavigationAction 
          label="Downloads" 
          icon={<DownloadIcon />} 
        />
        <BottomNavigationAction 
          label="Search" 
          icon={<SearchIcon />} 
          onClick={() => {
            if (activeTab === 1) {
              setSearchExpandTimestamp(Date.now());
            }
          }}
        />
        <BottomNavigationAction 
          label="Settings" 
          icon={<SettingsIcon />} 
        />
      </BottomNavigation>
    </Container>
  );
}

export default App;
