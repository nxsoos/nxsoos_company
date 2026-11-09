import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Companion } from './Companion';
import { AppBoundary } from './AppBoundary';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBoundary>
      {location.pathname.startsWith('/visualizer') ? <Companion /> : <App />}
    </AppBoundary>
  </React.StrictMode>,
);
