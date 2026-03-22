import React, { useState } from 'react';
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

type BootstrapTarget = 'landing' | 'signup' | 'signin';

function BootLanding({
  onStartSignup,
  onStartSignin,
}: {
  onStartSignup: () => void;
  onStartSignin: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#101826',
        color: '#f8fbff',
        fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          minHeight: '100vh',
          display: 'grid',
          alignContent: 'center',
          gap: 20,
          padding: '32px 20px',
        }}
      >
        <section
          style={{
            borderRadius: 30,
            padding: 32,
            background: '#162235',
            border: '1px solid #23344c',
            display: 'grid',
            gap: 18,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              width: 'fit-content',
              padding: '10px 14px',
              borderRadius: 999,
              background: '#173549',
              border: '1px solid #23607e',
              color: '#9fe8ff',
              fontSize: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ClearFlow Core OS
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05 }}>
            Finance, records, compliance, and cash flow in one place.
          </div>
          <div style={{ fontSize: 18, lineHeight: 1.75, color: '#d7e3ee', maxWidth: 760 }}>
            ClearFlow is built to feel like a real financial operating system, not a pile of
            disconnected tools. Start a new workspace or continue into secure sign-in.
          </div>
        </section>

        <section
          style={{
            borderRadius: 30,
            padding: 28,
            background: '#162235',
            border: '1px solid #23344c',
            display: 'grid',
            gap: 16,
          }}
        >
          <div style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, color: '#8cebff' }}>
            Secure Entry
          </div>
          <div
            style={{
              display: 'grid',
              gap: 16,
            }}
          >
            <div
              style={{
                borderRadius: 24,
                padding: 22,
                background: '#183145',
                border: '1px solid #255573',
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800 }}>New User Signup</div>
              <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                Start onboarding for a new workspace, entity setup, and operating profile.
              </div>
              <button
                type="button"
                onClick={onStartSignup}
                style={{
                  minHeight: 50,
                  borderRadius: 16,
                  border: '1px solid #2e7aa1',
                  background: '#1d7ea2',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                Start Secure Onboarding
              </button>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 22,
                background: '#1a2940',
                border: '1px solid #273a57',
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800 }}>Existing Member Sign In</div>
              <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                Use Google sign-in as the primary path, with backup access underneath when needed.
              </div>
              <button
                type="button"
                onClick={onStartSignin}
                style={{
                  minHeight: 48,
                  borderRadius: 16,
                  border: '1px solid #2d607d',
                  background: '#1b3650',
                  color: '#ecfeff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                Continue to Sign In
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function BootstrapRoot() {
  const [target, setTarget] = useState<BootstrapTarget>('landing');

  if (target === 'landing') {
    return (
      <BootLanding
        onStartSignup={() => setTarget('signup')}
        onStartSignin={() => setTarget('signin')}
      />
    );
  }

  return (
    <AuthProvider>
      <App
        initialEntryStage={target === 'signup' ? 'pathSelect' : 'welcome'}
        initialWelcomeView={target === 'signin' ? 'signin' : 'landing'}
      />
    </AuthProvider>
  );
}

root.render(<BootstrapRoot />);

// AI Studio always uses an `index.tsx` file for all project types.
