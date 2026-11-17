import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import { PORTAL_SURFACE } from './lib/portalAccess.js';
import { ExternalAuthProvider } from './auth/ExternalAuthContext.jsx';
import { ThemeProvider } from './lib/ThemeContext.jsx';
import './theme.css';

const PartnershipPage = lazy(() => import('./pages/Partnership.jsx').then(module => ({ default: module.PartnershipPage })));
const PartnershipDemo = lazy(() => import('./pages/Partnership.jsx').then(module => ({ default: module.PartnershipDemo })));

const partnershipEnabled = PORTAL_SURFACE === 'CUSTOMER' &&
  (import.meta.env.DEV || import.meta.env.VITE_PARTNERSHIP_PUBLIC_ENABLED === 'true');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<div role="status" className="p-6 text-muted">Loading…</div>}><Routes>
          {partnershipEnabled && <>
            <Route path="/partners" element={<PartnershipPage />} />
            <Route path="/partners/demo" element={<PartnershipDemo />} />
          </>}
          <Route path="*" element={<ExternalAuthProvider><App /></ExternalAuthProvider>} />
        </Routes></Suspense>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
