import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ExternalAuthProvider } from './auth/ExternalAuthContext.jsx';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ExternalAuthProvider>
        <App />
      </ExternalAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
