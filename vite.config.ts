import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'net': 'net-browserify',
      'tls': 'net-browserify',
      'fs': path.resolve(__dirname, './src/mobile/utils/fs-mock.ts'),
      'path': 'path-browserify',
      'os': 'os-browserify',
      'crypto': 'crypto-browserify',
      'stream': 'stream-browserify',
      'util': 'util',
      'events': 'events',
      'node:util': 'util',
      'node:events': 'events',
      'node:process': 'process',
      'node:stream': 'stream-browserify',
      'node:fs': path.resolve(__dirname, './src/mobile/utils/fs-mock.ts'),
      'node:path': 'path-browserify',
      'node:crypto': 'crypto-browserify',
      'node:os': 'os-browserify',
      'child_process': path.resolve(__dirname, './src/mobile/utils/spawn-mock.ts'),
      'node:child_process': path.resolve(__dirname, './src/mobile/utils/spawn-mock.ts'),
      'timers': 'timers-browserify',
      'http': 'stream-http',
      'https': 'https-browserify',
      'vm': 'vm-browserify',
      'assert': 'assert',
      'node:assert': 'assert',
      'url': 'url',
      'node:url': 'url',
      'buffer': 'buffer',
      'node:buffer': 'buffer',
      'electron': path.resolve(__dirname, './src/mobile/utils/electron-mock.ts'),
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
  },
});
