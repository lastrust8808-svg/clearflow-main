import { createRoot } from 'react-dom/client';
import App from './src/app/App';
import { AuthProvider } from './src/contexts/AuthContext';

async function clearLegacyServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn('Unable to unregister legacy service workers.', error);
  }

  if (typeof caches === 'undefined') {
    return;
  }

  try {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith('clear-flow-cache'))
        .map((key) => caches.delete(key))
    );
  } catch (error) {
    console.warn('Unable to clear legacy service worker caches.', error);
  }
}

const container = document.getElementById('root');

if (!container) {
  throw new Error('ClearFlow root container is missing.');
}

const root = createRoot(container);
void clearLegacyServiceWorkers();
root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);

// AI Studio always uses an `index.tsx` file for all project types.
