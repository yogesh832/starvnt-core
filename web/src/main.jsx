import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import { PartnershipDemo, PartnershipPage } from './pages/Partnership.jsx';
import { PORTAL_SURFACE } from './lib/portalAccess.js';
import { ExternalAuthProvider } from './auth/ExternalAuthContext.jsx';
import { ThemeProvider } from './lib/ThemeContext.jsx';
import './theme.css';

const partnershipEnabled = PORTAL_SURFACE === 'CUSTOMER' &&
  (import.meta.env.DEV || import.meta.env.VITE_PARTNERSHIP_PUBLIC_ENABLED === 'true');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {partnershipEnabled && <>
            <Route path="/partners" element={<PartnershipPage />} />
            <Route path="/partners/demo" element={<PartnershipDemo />} />
          </>}
          <Route path="*" element={<ExternalAuthProvider><App /></ExternalAuthProvider>} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
