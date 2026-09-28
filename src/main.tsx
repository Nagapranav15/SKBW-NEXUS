import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Auto-recover from stale deployment chunks and module load failures (Vite SPA deployment desync)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const lastReload = parseInt(sessionStorage.getItem('chunk_reload_time') || '0', 10);
    const now = Date.now();
    if (now - lastReload > 8000) {
      sessionStorage.setItem('chunk_reload_time', String(now));
      window.location.reload();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || '');
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Expected a JavaScript-or-Wasm module script') ||
      msg.includes('MIME type of "text/html"') ||
      msg.includes('Importing a module script failed')
    ) {
      event.preventDefault();
      const lastReload = parseInt(sessionStorage.getItem('chunk_reload_time') || '0', 10);
      const now = Date.now();
      if (now - lastReload > 8000) {
        sessionStorage.setItem('chunk_reload_time', String(now));
        window.location.reload();
      }
    }
  });

  window.addEventListener('online', () => {
    sessionStorage.removeItem('chunk_reload_time');
    sessionStorage.removeItem('chunk_failed_refreshed');
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
