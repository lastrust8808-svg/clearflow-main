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
        background:
          'linear-gradient(135deg, #0d1726 0%, #102033 52%, #13283e 100%)',
        color: '#f8fbff',
        fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          minHeight: '100vh',
          display: 'grid',
          alignItems: 'center',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(360px, 0.85fr)',
          gap: 24,
          padding: '36px 22px',
        }}
      >
        <section
          style={{
            borderRadius: 32,
            padding: 34,
            background: 'linear-gradient(180deg, rgba(20, 39, 61, 0.96), rgba(17, 31, 49, 0.98))',
            border: '1px solid rgba(107, 221, 255, 0.22)',
            display: 'grid',
            gap: 22,
            boxShadow: '0 24px 70px rgba(5, 12, 20, 0.28)',
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
              background: 'rgba(28, 81, 112, 0.62)',
              border: '1px solid rgba(118, 229, 255, 0.26)',
              color: '#9fe8ff',
              fontSize: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            ClearFlow Core OS
          </div>
          <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.03, maxWidth: 720 }}>
            Finance, records, compliance, and cash flow in one place.
          </div>
          <div style={{ fontSize: 18, lineHeight: 1.78, color: '#d7e3ee', maxWidth: 760 }}>
            ClearFlow is built to feel like a real financial operating system, not a pile of
            disconnected tools. The goal is one workspace for entity setup, ERP accounting,
            asset control, treasury and settlement visibility, compliance tracking, document
            vaulting, and AI-guided workflow generation.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {[
              'Entity management and authority records',
              'ERP accounting, invoices, receipts, and reconciliation',
              'Assets, wallets, settlements, and treasury controls',
              'Documents, compliance workflows, and AI generators',
            ].map((pillar) => (
              <div
                key={pillar}
                style={{
                  borderRadius: 20,
                  padding: '16px 18px',
                  background: 'rgba(23, 43, 67, 0.9)',
                  border: '1px solid rgba(94, 203, 236, 0.16)',
                  color: '#edf6fb',
                  lineHeight: 1.6,
                }}
              >
                {pillar}
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            borderRadius: 30,
            padding: 28,
            background: 'linear-gradient(180deg, rgba(18, 34, 54, 0.98), rgba(15, 28, 44, 0.98))',
            border: '1px solid rgba(94, 203, 236, 0.18)',
            display: 'grid',
            gap: 16,
            boxShadow: '0 22px 60px rgba(5, 12, 20, 0.24)',
          }}
        >
          <div
            style={{
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: 2,
              color: '#8cebff',
            }}
          >
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
                background: 'rgba(23, 59, 84, 0.88)',
                border: '1px solid rgba(71, 178, 214, 0.34)',
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
                  border: '1px solid rgba(89, 209, 240, 0.52)',
                  background: 'linear-gradient(135deg, #1f91b4, #2db8cf)',
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
                background: 'rgba(21, 40, 63, 0.88)',
                border: '1px solid rgba(70, 125, 163, 0.34)',
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
                  border: '1px solid rgba(83, 147, 191, 0.42)',
                  background: 'linear-gradient(135deg, #214666, #2a6286)',
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
