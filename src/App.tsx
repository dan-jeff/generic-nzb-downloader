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
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  LightMode as LightIcon,
  DarkMode as DarkIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import DownloadPanel from './components/DownloadPanel';
import SearchPanel from './components/SearchPanel';
import { SettingsPanelHandle } from './components/SettingsPanel';
import SettingsSheet from './components/SettingsSheet';
import BackgroundBubbles from './components/BackgroundBubbles';
import { useDownloads } from './hooks/useDownloads';
import { serviceContainer } from '@/core/ServiceContainer';
import { getElectronBridge } from './utils/platform';
import { useThemeMode } from './contexts/ThemeModeContext';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Buffer } from 'buffer';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  transitionDir?: 'left' | 'right' | null;
}

function CustomTabPanel({ children, value, index, transitionDir }: TabPanelProps) {
  const active = value === index;
  return (
    <Box
      role="tabpanel"
      id={`panel-${index}`}
      aria-labelledby={`tab-${index}`}
      key={active && transitionDir ? `${index}-${transitionDir}` : index}
      className={
        active && transitionDir === 'right' ? 'page-enter-right' :
        active && transitionDir === 'left'  ? 'page-enter-left'  : undefined
      }
      sx={{
        height: '100%',
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <Box sx={{ pt: 1.5, pb: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Box>
  );
}

import NativeNzbDownloader from './mobile/plugins/NativeNzbDownloader';

const TAB_COUNT = 2;

function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [appVersion, setAppVersion] = useState('');
  const [searchExpandTimestamp, setSearchExpandTimestamp] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transitionDir, setTransitionDir] = useState<'left' | 'right' | null>(null);
  const [webUnavailableOpen, setWebUnavailableOpen] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { mode, toggle: toggleMode } = useThemeMode();
  useDownloads();

  const settingsRef = React.useRef<SettingsPanelHandle>(null);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number; target: EventTarget | null } | null>(null);

  useEffect(() => {
    const backButtonListener = CapacitorApp.addListener('backButton', () => {
      if (settingsOpen) {
        if (settingsRef.current?.handleBack()) return;
        setSettingsOpen(false);
        return;
      }
      if (activeTab !== 0) {
        setActiveTab(0);
        return;
      }
      CapacitorApp.exitApp();
    });

    const appUrlOpenListener = CapacitorApp.addListener('appUrlOpen', async (data) => {
      try {
        let filename = 'imported.nzb';
        try {
          const decoded = decodeURIComponent(data.url);
          const cleanName = decoded.split('/').pop();
          if (cleanName && cleanName.toLowerCase().endsWith('.nzb')) {
            filename = cleanName;
          } else if (data.url.includes('.nzb')) {
            filename = `imported_${Date.now()}.nzb`;
          }
        } catch (e) {
          console.warn('Error extracting filename:', e);
        }

        let buffer: Buffer | null = null;
        try {
          const result = await NativeNzbDownloader.fetchNzbContent({ url: data.url });
          if (result.data) buffer = Buffer.from(result.data, 'base64');
        } catch (nativeError) {
          try {
            const contents = await Filesystem.readFile({ path: data.url });
            if (contents.data) buffer = Buffer.from(contents.data as string, 'base64');
          } catch (fsError) {
            console.error('Filesystem fallback failed:', fsError);
            throw nativeError;
          }
        }

        if (buffer) {
          const dm = await serviceContainer.getDownloadManager();
          await dm.addDownload(buffer, filename);
          setActiveTab(1); // jump to Downloads so the user sees the imported item
        }
      } catch (error) {
        console.error('Failed to handle intent URL:', error);
      }
    });

    return () => {
      backButtonListener.then(l => l.remove());
      appUrlOpenListener.then(l => l.remove());
    };
  }, [activeTab, settingsOpen]);

  useEffect(() => {
    const initializeServices = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          try {
            await StatusBar.setStyle({ style: mode === 'dark' ? Style.Dark : Style.Light });
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
        const electron = getElectronBridge();
        if (!electron) return;
        setAppVersion(await electron.getAppVersion());
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };

    initializeServices();
    fetchVersion();

    const onTlsUnavailable = () => setWebUnavailableOpen(true);
    window.addEventListener('tls-socket-web-unavailable', onTlsUnavailable);
    return () => window.removeEventListener('tls-socket-web-unavailable', onTlsUnavailable);
  }, [mode]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTransitionDir(newValue > activeTab ? 'right' : newValue < activeTab ? 'left' : null);
    setActiveTab(newValue);
  };

  const handleSwipe = React.useCallback((direction: 'left' | 'right') => {
    setActiveTab((prev) => {
      const next = direction === 'left' ? prev + 1 : prev - 1;
      if (next < 0 || next >= TAB_COUNT) return prev;
      setTransitionDir(direction === 'left' ? 'right' : 'left');
      return next;
    });
  }, []);

  const handleTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now(), target: event.target };
  }, []);

  const handleTouchEnd = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const deltaT = Date.now() - start.time;
    touchStartRef.current = null;

    if (deltaT > 600) return;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Swipe-up opens settings — only if the gesture begins inside the bottom
    // swipe-indicator strip, so everyday page swipes don't trigger it.
    if (!settingsOpen && deltaY < -60 && absY > absX * 1.5) {
      const distanceFromBottom = window.innerHeight - start.y;
      if (distanceFromBottom < 90) {
        setSettingsOpen(true);
        return;
      }
    }

    // Otherwise horizontal swipe flips tabs.
    if (absX < 80) return;
    if (absY > absX * 0.6) return;

    // Bail if the gesture began inside a horizontal scroll container.
    let el: (Node & ParentNode) | null = start.target as Node & ParentNode | null;
    while (el && el !== document.body) {
      if (el instanceof Element) {
        const style = window.getComputedStyle(el);
        if (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          el.scrollWidth > el.clientWidth
        ) {
          return;
        }
      }
      el = el.parentNode;
    }

    handleSwipe(deltaX < 0 ? 'left' : 'right');
  }, [handleSwipe, settingsOpen]);

  return (
    <>
      <BackgroundBubbles />

      <Container
        maxWidth={false}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        sx={{
          position: 'relative',
          zIndex: 1,
          pt: { xs: 'calc(env(safe-area-inset-top) + 16px)', sm: 'calc(env(safe-area-inset-top) + 24px)' },
          pb: 'env(safe-area-inset-bottom)',
          pl: { xs: 'max(16px, env(safe-area-inset-left))', sm: 3 },
          pr: { xs: 'max(16px, env(safe-area-inset-right))', sm: 3 },
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header: title (left) + action icons (right) */}
        <Box sx={{ mb: 1, pb: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <DownloadIcon sx={{ fontSize: isMobile ? 22 : 26, color: 'primary.main' }} />
            <Typography
              variant="h4"
              component="h1"
              sx={{
                letterSpacing: '0.04em',
                fontWeight: 800,
                fontSize: isMobile ? '1rem' : '1.25rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Generic NZB <Box component="span" sx={{ color: 'primary.main' }}>Downloader</Box>
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
            {!isMobile && appVersion && (
              <Chip
                label={`v${appVersion}`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, borderColor: 'divider', mr: 0.5 }}
              />
            )}
            <Tooltip title={mode === 'dark' ? 'Switch to light' : 'Switch to dark'}>
              <IconButton onClick={toggleMode} size="small" aria-label="toggle theme">
                {mode === 'dark' ? <LightIcon fontSize="small" /> : <DarkIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton onClick={() => setSettingsOpen(true)} size="small" aria-label="open settings">
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Desktop tabs — Search on left (0), Downloads on right (1) */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', display: isMobile ? 'none' : 'block' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="primary navigation"
            textColor="primary"
            indicatorColor="primary"
            sx={{ minHeight: 32 }}
          >
            <Tab
              icon={<SearchIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label="Search"
              sx={{ minHeight: 32 }}
              onClick={() => { if (activeTab === 0) setSearchExpandTimestamp(Date.now()); }}
            />
            <Tab icon={<DownloadIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Downloads" sx={{ minHeight: 32 }} />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, pb: isMobile ? 'calc(env(safe-area-inset-bottom) + 52px)' : 0 }}>
          <CustomTabPanel value={activeTab} index={0} transitionDir={transitionDir}>
            <SearchPanel expandSignal={searchExpandTimestamp} />
          </CustomTabPanel>
          <CustomTabPanel value={activeTab} index={1} transitionDir={transitionDir}>
            <DownloadPanel />
          </CustomTabPanel>
        </Box>

        {/* Mobile swipe indicator — dots + current-tab label + directional chevrons */}
        {isMobile && (
          <Box
            sx={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2,
              pt: 1,
              pb: 'calc(env(safe-area-inset-bottom) + 10px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              pointerEvents: 'none', // gestures pass through; only the dots inside capture taps
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pointerEvents: 'auto' }}>
              <ChevronLeftIcon
                sx={{
                  fontSize: 18,
                  color: activeTab > 0 ? 'text.secondary' : 'transparent',
                  transition: 'color 0.2s',
                }}
              />
              {[
                { label: 'Search',    icon: <SearchIcon   sx={{ fontSize: 14 }} /> },
                { label: 'Downloads', icon: <DownloadIcon sx={{ fontSize: 14 }} /> },
              ].map((t, i) => {
                const active = activeTab === i;
                return (
                  <Box
                    key={i}
                    onClick={() => setActiveTab(i)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: active ? 1.25 : 0,
                      py: 0.5,
                      borderRadius: 999,
                      bgcolor: active ? 'action.selected' : 'transparent',
                      color: active ? 'primary.main' : 'text.disabled',
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {active ? (
                      <>
                        {t.icon}
                        {t.label}
                      </>
                    ) : (
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', opacity: 0.5 }} />
                    )}
                  </Box>
                );
              })}
              <ChevronRightIcon
                sx={{
                  fontSize: 18,
                  color: activeTab < 1 ? 'text.secondary' : 'transparent',
                  transition: 'color 0.2s',
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
              swipe to switch
            </Typography>
          </Box>
        )}

        <Snackbar
          open={webUnavailableOpen}
          autoHideDuration={6000}
          onClose={() => setWebUnavailableOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{
            // Keep above the bottom navigation on mobile
            bottom: isMobile
              ? 'calc(env(safe-area-inset-bottom) + 64px) !important'
              : undefined,
          }}
        >
          <Alert
            severity="info"
            variant="filled"
            onClose={() => setWebUnavailableOpen(false)}
            sx={{ maxWidth: 480 }}
          >
            Direct Usenet needs a TLS socket, which isn't available in the browser. Use SABnzbd / NZBget here, or run the Electron or Android build.
          </Alert>
        </Snackbar>
      </Container>

      <SettingsSheet
        open={settingsOpen}
        onOpen={() => setSettingsOpen(true)}
        onClose={() => setSettingsOpen(false)}
        panelRef={settingsRef}
      />
    </>
  );
}

export default App;
