import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './app/error-boundary';
import { PortalApp } from './app/portal-app';
import { SessionProvider } from './auth/session';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SessionProvider><PortalApp /></SessionProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
