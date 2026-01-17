import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appName: 'Generic NZB Downloader',
  appId: 'com.dan.generic_nzb_downloader',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*']
  },
  plugins: {
    BackgroundMode: {
      enabled: true
    },
    StatusBar: {
      style: 'dark',
      overlaysWebView: true
    }
  }
};

export default config;
