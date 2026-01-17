import debugLogger from './utils/debugLogger';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import theme from './theme';
import './index.css';

console.log('GenericDownloader: main.tsx executing');

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('GenericDownloader: #root element not found');
  } else {
    console.log('GenericDownloader: Mounting React app');
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </React.StrictMode>
    );
    console.log('GenericDownloader: React mount command issued');
  }
} catch (e) {
  console.error('GenericDownloader: Error in main.tsx', e);
}
