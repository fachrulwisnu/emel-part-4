import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global Anti-Cache Interceptor for all API requests
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const options: RequestInit = init ? { ...init } : {};
  const headers = new Headers(options.headers || {});

  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  options.headers = headers;
  if (!options.cache) {
    options.cache = 'no-store';
  }

  return originalFetch(input, options);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

