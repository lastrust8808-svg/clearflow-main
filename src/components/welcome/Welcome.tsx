import React, { useEffect, useState } from 'react';
import { Logo } from '../logo/Logo';

interface WelcomeProps {
  initialView?: 'landing';
  initialIntent?: 'new' | 'existing';
  lastKnownGoogleUser?: { name: string; email: string } | null;
  onDevLogin: () => void;
  onStartNewMember: () => void;
  onStartExistingMember: () => void;
  startGoogleSignIn: (mode?: 'new' | 'existing' | 'returning') => Promise<{ success: boolean; error?: string }>;
}

const platformPillars = [
  'Entity management and authority records',
  'ERP accounting, receipts, invoices, and reconciliation',
  'Asset registry, wallets, and settlement controls',
  'Documents, compliance workflows, and AI generators',
];

const moduleLabels = [
  'Overview',
  'Entities',
  'Accounting',
  'Ledger',
  'Assets',
  'Transactions',
  'Compliance',
  'Documents',
  'AI Studio',
];

export const Welcome: React.FC<WelcomeProps> = ({
  initialView = 'landing',
  initialIntent = 'existing',
  lastKnownGoogleUser,
  onDevLogin,
  onStartNewMember,
  onStartExistingMember,
  startGoogleSignIn,
}) => {
  const [entryView, setEntryView] = useState<'landing' | 'help'>(initialView);
  const [signInIntent, setSignInIntent] = useState<'new' | 'existing'>(initialIntent);
  const [googleLaunchError, setGoogleLaunchError] = useState('');
  const [isLaunchingGoogle, setIsLaunchingGoogle] = useState(false);
  const canUseDevAccess =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const launchGoogle = async (intent: 'new' | 'existing' | 'returning') => {
    setGoogleLaunchError('');
    setSignInIntent(intent === 'new' ? 'new' : 'existing');
    setIsLaunchingGoogle(true);

    if (intent === 'new') {
      onStartNewMember();
    } else {
      onStartExistingMember();
    }

    const result = await startGoogleSignIn(intent);
    if (!result.success) {
      setGoogleLaunchError(result.error || 'Google sign-in could not start right now.');
      setIsLaunchingGoogle(false);
      return;
    }
  };

  useEffect(() => {
    if (entryView === 'landing') {
      setIsLaunchingGoogle(false);
    }
  }, [entryView]);

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(54, 215, 255, 0.2), transparent 25%), radial-gradient(circle at 80% 10%, rgba(88, 141, 255, 0.16), transparent 24%), radial-gradient(circle at 20% 100%, rgba(247, 211, 123, 0.12), transparent 20%), linear-gradient(135deg, #120816 0%, #1b1026 45%, #0c1224 100%)',
        color: '#fff6fd',
        fontFamily: '"Trebuchet MS", "Avenir Next", "Segoe UI", sans-serif',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.3,
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.34) 0.7px, transparent 0.7px), radial-gradient(rgba(54,215,255,0.16) 0.8px, transparent 0.8px)',
          backgroundPosition: '0 0, 18px 18px',
          backgroundSize: '36px 36px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 75%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1220,
          margin: '0 auto',
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(340px, 0.88fr)',
          gap: 28,
          alignItems: 'center',
          padding: '32px 20px',
        }}
      >
        <section
          style={{
            borderRadius: 32,
            padding: 32,
            background: 'rgba(24, 18, 42, 0.74)',
            border: '1px solid rgba(126, 242, 255, 0.16)',
            boxShadow: '0 24px 80px rgba(9, 5, 17, 0.45)',
            backdropFilter: 'blur(18px)',
            display: 'grid',
            gap: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 999,
                background: 'rgba(54, 215, 255, 0.12)',
                border: '1px solid rgba(126, 242, 255, 0.24)',
                color: '#8cebff',
                fontSize: 12,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ClearFlow Core OS
            </div>
            <div style={{ color: '#c5d7e3', fontSize: 14 }}>
              Integrated Financial Management with wealth-operator energy
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Logo height={72} />
              <div>
                <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05 }}>
                  Finance, records, compliance, and cash flow in one place.
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                lineHeight: 1.75,
                color: '#d9e7ef',
                maxWidth: 760,
              }}
            >
              ClearFlow is built to feel like a real financial operating system, not a pile of
              disconnected tools. The goal is one workspace for entity setup, ERP accounting,
              asset control, treasury and settlement visibility, compliance tracking, document
              vaulting, and AI-guided workflow generation.
            </div>
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.8,
                color: '#b9cbda',
                maxWidth: 760,
              }}
            >
              This is where users can create and manage entities, keep their books aligned,
              register assets and wallets, reconcile money movement, retain supporting documents,
              and generate the records needed to keep wealth structures and business operations
              moving cleanly.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {platformPillars.map((pillar) => (
              <div
                key={pillar}
                style={{
                  borderRadius: 20,
                  padding: '16px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#edf6fb',
                  lineHeight: 1.6,
                }}
              >
                {pillar}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {moduleLabels.map((label) => (
              <div
                key={label}
                style={{
                  padding: '10px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(126, 242, 255, 0.14)',
                  color: '#d8ecf6',
                  fontSize: 13,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            borderRadius: 30,
            padding: 28,
            background: 'rgba(28, 19, 45, 0.86)',
            border: '1px solid rgba(126, 242, 255, 0.16)',
            boxShadow: '0 24px 80px rgba(9, 5, 17, 0.45)',
            backdropFilter: 'blur(20px)',
            display: 'grid',
            gap: 20,
          }}
        >
          {entryView === 'landing' ? (
            <>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    color: '#8cebff',
                    marginBottom: 10,
                  }}
                >
                  Secure Entry
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
                  Choose how you want to enter ClearFlow
                </div>
                <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
                  Existing members use Google to go straight into their dashboard. New users sign
                  in with Google first, complete their personal operator profile, then connect
                  entities from inside the workspace.
                </div>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                {lastKnownGoogleUser ? (
                  <div
                    style={{
                      borderRadius: 24,
                      padding: 22,
                      background:
                        'linear-gradient(180deg, rgba(54, 215, 255, 0.14), rgba(88, 141, 255, 0.08))',
                      border: '1px solid rgba(126, 242, 255, 0.24)',
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: '#8cebff' }}>
                      Returning Member
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>Return to Dashboard</div>
                    <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                      Continue as <strong>{lastKnownGoogleUser.name}</strong> using{' '}
                      <strong>{lastKnownGoogleUser.email}</strong>.
                    </div>
                    <button
                      type="button"
                      onClick={() => void launchGoogle('returning')}
                      style={{
                        minHeight: 50,
                        borderRadius: 16,
                        border: '1px solid rgba(126, 242, 255, 0.28)',
                        background:
                          'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: 15,
                      }}
                      disabled={isLaunchingGoogle}
                    >
                      {isLaunchingGoogle && signInIntent === 'existing'
                        ? 'Opening Dashboard Access...'
                        : 'Return with Google'}
                    </button>
                  </div>
                ) : null}

                <div
                  style={{
                    borderRadius: 24,
                    padding: 22,
                    background:
                      'linear-gradient(180deg, rgba(54, 215, 255, 0.12), rgba(54, 215, 255, 0.05))',
                    border: '1px solid rgba(126, 242, 255, 0.24)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800 }}>New User Sign Up</div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                    Start with Google, then complete your operator profile first and connect entities afterward.
                  </div>
                  <button
                    type="button"
                    onClick={() => void launchGoogle('new')}
                    style={{
                      minHeight: 50,
                      borderRadius: 16,
                      border: '1px solid rgba(126, 242, 255, 0.28)',
                      background:
                        'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                      color: '#fff',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: 15,
                    }}
                    disabled={isLaunchingGoogle}
                  >
                    {isLaunchingGoogle && signInIntent === 'new'
                      ? 'Starting Google...'
                      : 'Continue with Google'}
                  </button>
                </div>

                <div
                  style={{
                    borderRadius: 24,
                    padding: 22,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Existing Sign In</div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                    Continue with the Google account already connected to your ClearFlow workspace.
                  </div>
                  <button
                    type="button"
                    onClick={() => void launchGoogle('existing')}
                    style={{
                      minHeight: 48,
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#eff6fb',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: 15,
                    }}
                    disabled={isLaunchingGoogle}
                  >
                    {isLaunchingGoogle && signInIntent === 'existing'
                      ? 'Starting Google...'
                      : lastKnownGoogleUser
                        ? 'Use another Google account'
                        : 'Continue with Google'}
                  </button>
                </div>
              </div>
              {googleLaunchError ? (
                <div
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(248, 113, 113, 0.24)',
                    color: '#fecaca',
                    lineHeight: 1.6,
                    fontSize: 14,
                  }}
                >
                  {googleLaunchError}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      color: '#8cebff',
                      marginBottom: 10,
                    }}
                  >
                    Google Sign-In Help
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
                    Troubleshoot account access
                  </div>
                  <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
                    If Google sign-in is failing, use the same Google email already tied to your ClearFlow workspace. If you lost access to that email, request a temporary access handoff so the login email can be changed securely.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEntryView('signin')}
                  style={{
                    minHeight: 42,
                    padding: '0 14px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#eff6fb',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                {[
                  'Use the exact Google account originally used to enter ClearFlow.',
                  'If you are brand new, return to Google sign-in and continue with the Google account you want tied to the workspace.',
                  'If that Google account is no longer accessible, request temporary login support so the account email can be updated securely.',
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      borderRadius: 20,
                      padding: 18,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#d9e7ef',
                      lineHeight: 1.7,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>

              <a
                href="mailto:billing@clearflow.site?subject=ClearFlow%20Google%20Sign-In%20Help"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 48,
                  borderRadius: 16,
                  border: '1px solid rgba(126, 242, 255, 0.24)',
                  background:
                    'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 15,
                  textDecoration: 'none',
                }}
              >
                Request Temporary Access Help
              </a>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
