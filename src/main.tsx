import debugLogger from './utils/debugLogger';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeModeProvider } from './contexts/ThemeModeContext';
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
        <ThemeModeProvider>
          <App />
        </ThemeModeProvider>
      </React.StrictMode>
    );
    console.log('GenericDownloader: React mount command issued');
  }
} catch (e) {
  console.error('GenericDownloader: Error in main.tsx', e);
}
