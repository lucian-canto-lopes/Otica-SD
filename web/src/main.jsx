import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { SessionProvider } from './lib/session.jsx';
import { ConfirmProvider, ToastProvider } from './components/ui.jsx';
import './styles.css';

try {
  const theme = localStorage.getItem('ocular-theme');
  if (theme) document.documentElement.dataset.theme = theme;
} catch {
  // Armazenamento indisponível (modo privado): segue o tema do sistema.
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <SessionProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </SessionProvider>
    </HashRouter>
  </React.StrictMode>,
);
