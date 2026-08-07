import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global Anti-Cache Interceptor for all API requests
try {
  const originalFetch = window.fetch;
  if (originalFetch) {
    const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
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

    try {
      window.fetch = customFetch;
    } catch {
      try {
        Object.defineProperty(window, 'fetch', {
          value: customFetch,
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.warn('Could not override window.fetch:', e);
      }
    }
  }
} catch (e) {
  console.warn('Fetch interceptor setup error:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

