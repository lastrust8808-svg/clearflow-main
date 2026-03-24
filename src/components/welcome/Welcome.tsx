import React, { useEffect, useMemo, useState } from 'react';
import { Logo } from '../logo/Logo';

interface WelcomeProps {
  initialView?: 'landing' | 'signin';
  initialIntent?: 'new' | 'existing';
  isConfigured: boolean;
  onDevLogin: () => void;
  onStartNewMember: () => void;
  onStartExistingMember: () => void;
  renderGoogleButton: (elementId: string) => void;
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
  isConfigured,
  onDevLogin,
  onStartNewMember,
  onStartExistingMember,
  renderGoogleButton,
}) => {
  const [entryView, setEntryView] = useState<'landing' | 'signin' | 'help'>(initialView);
  const [signInIntent, setSignInIntent] = useState<'new' | 'existing'>(initialIntent);
  const canUseDevAccess =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    if (isConfigured && entryView === 'signin') {
      renderGoogleButton('google-btn-container');
    }
  }, [entryView, isConfigured, renderGoogleButton]);

  const signInCopy = useMemo(
    () =>
      signInIntent === 'existing'
        ? {
            eyebrow: 'Existing Member Sign In',
            title: 'Use Google to open your existing workspace',
            description:
              'Sign in with the same Google account already tied to ClearFlow and you will go straight back into your dashboard.',
          }
        : {
            eyebrow: 'New User Sign Up',
            title: 'Use Google to start your new ClearFlow workspace',
            description:
              'Sign in with the Google account you want tied to this workspace. Right after sign-in, you will choose the account or entity type and continue onboarding.',
          },
    [signInIntent]
  );

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
                  in with Google first, then choose their account or entity type and continue onboarding.
                </div>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
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
                    Start with Google, then choose the account or entity type and continue secure onboarding.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSignInIntent('new');
                      setEntryView('signin');
                      onStartNewMember();
                    }}
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
                  >
                    Continue with Google
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
                    onClick={() => {
                      setSignInIntent('existing');
                      setEntryView('signin');
                      onStartExistingMember();
                    }}
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
                  >
                    Continue with Google
                  </button>
                </div>
              </div>
            </>
          ) : entryView === 'help' ? (
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
                    {signInCopy.eyebrow}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
                    {signInCopy.title}
                  </div>
                  <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
                    {signInCopy.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEntryView('landing')}
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

              <div
                style={{
                  padding: 18,
                  borderRadius: 22,
                  background:
                    'linear-gradient(135deg, rgba(54, 215, 255, 0.12), rgba(88, 141, 255, 0.08))',
                  border: '1px solid rgba(126, 242, 255, 0.2)',
                  color: '#dff7fb',
                  lineHeight: 1.7,
                }}
              >
                {signInIntent === 'existing'
                  ? 'Use the Google account already tied to your ClearFlow workspace.'
                  : 'Use the Google account you want tied to your new workspace. After sign-in, ClearFlow will walk you through account or entity onboarding.'}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  padding: 18,
                  borderRadius: 22,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div id="google-btn-container" style={{ minHeight: 44 }} />
                {!isConfigured ? (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.24)',
                      color: '#fcdca4',
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    Google sign-in is not configured in this environment yet.
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  padding: 18,
                  borderRadius: 22,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>Need Help Instead?</div>
                <div style={{ color: '#c5d7e3', lineHeight: 1.7 }}>
                  If Google sign-in is not working, open the Google sign-in troubleshooter to recover access or request a temporary login handoff so the workspace email can be changed securely.
                </div>
                <button
                  type="button"
                  onClick={() => setEntryView('help')}
                  style={{
                    minHeight: 46,
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#eff6fb',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Can&apos;t Sign In with Google?
                </button>
              </div>

              {canUseDevAccess ? (
                <button
                  type="button"
                  onClick={onDevLogin}
                  style={{
                    minHeight: 46,
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#eff6fb',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Dev Login
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
