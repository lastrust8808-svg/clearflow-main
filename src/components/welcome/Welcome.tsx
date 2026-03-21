import React, { useEffect, useState } from 'react';
import { Logo } from '../logo/Logo';
import type { LocalAuthChallenge, LocalAuthContactType } from '../../services/localAuth.service';

interface WelcomeProps {
  isConfigured: boolean;
  onDevLogin: () => void;
  onStartOnboarding: () => void;
  renderGoogleButton: (elementId: string) => void;
  pendingCredentialAuth: LocalAuthChallenge | null;
  onStartCredentialAuth: (input: {
    contactType: LocalAuthContactType;
    contactValue: string;
    name?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onVerifyCredentialAuth: (input: {
    code: string;
    userHandle?: string;
    password?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onSignInWithPassword: (input: {
    identifier: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onCancelCredentialAuth: () => void;
}

const platformPillars = [
  'Entity management and authority records',
  'ERP accounting, invoices, receipts, and reconciliation',
  'Assets, wallets, settlements, and treasury controls',
  'Documents, compliance workflows, and AI generators',
];

type EntryView = 'landing' | 'signin';
type BackupAuthMode = 'password' | 'verification';

const inputStyle: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(9, 15, 27, 0.82)',
  color: '#fff',
  padding: '0 14px',
  width: '100%',
  boxSizing: 'border-box',
};

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(126, 242, 255, 0.18)',
  background: 'rgba(54, 215, 255, 0.08)',
  color: '#effcff',
  fontWeight: 700,
  cursor: 'pointer',
};

export const Welcome: React.FC<WelcomeProps> = ({
  isConfigured,
  onDevLogin,
  onStartOnboarding,
  renderGoogleButton,
  pendingCredentialAuth,
  onStartCredentialAuth,
  onVerifyCredentialAuth,
  onSignInWithPassword,
  onCancelCredentialAuth,
}) => {
  const [entryView, setEntryView] = useState<EntryView>('landing');
  const [backupAuthMode, setBackupAuthMode] = useState<BackupAuthMode>('password');
  const [credentialMode, setCredentialMode] = useState<LocalAuthContactType>('email');
  const [contactValue, setContactValue] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupUserHandle, setBackupUserHandle] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (entryView === 'signin' && isConfigured) {
      renderGoogleButton('google-btn-container');
    }
  }, [entryView, isConfigured, renderGoogleButton]);

  const handleStartCredentialAuth = async () => {
    setIsSubmitting(true);
    try {
      const result = await onStartCredentialAuth({
        contactType: credentialMode,
        contactValue,
        name: displayName || undefined,
      });

      if (!result.success) {
        setCredentialError(result.error || 'Unable to start verification.');
        return;
      }

      setCredentialError('');
      setVerificationCode('');
      setBackupUserHandle('');
      setBackupPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCredentialAuth = async () => {
    setIsSubmitting(true);
    try {
      const result = await onVerifyCredentialAuth({
        code: verificationCode,
        userHandle: backupUserHandle || undefined,
        password: backupPassword || undefined,
      });
      if (!result.success) {
        setCredentialError(result.error || 'Unable to verify code.');
        return;
      }

      setCredentialError('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordSignIn = async () => {
    setIsSubmitting(true);
    try {
      const result = await onSignInWithPassword({
        identifier: signInIdentifier,
        password: signInPassword,
      });

      if (!result.success) {
        setCredentialError(result.error || 'Unable to sign in.');
        return;
      }

      setCredentialError('');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          opacity: 0.14,
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.34) 0.7px, transparent 0.7px), radial-gradient(rgba(54,215,255,0.16) 0.8px, transparent 0.8px)',
          backgroundPosition: '0 0, 18px 18px',
          backgroundSize: '36px 36px',
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
          gridTemplateColumns: 'minmax(0, 1.12fr) minmax(360px, 0.9fr)',
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
              Private treasury, accounting, assets, records, and operations
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Logo height={72} />
              <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05 }}>
                Finance, records, compliance, and cash flow in one place.
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
              asset control, transaction visibility, compliance tracking, document vaulting, and
              AI-guided workflow generation.
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
        </section>

        <section
          style={{
            borderRadius: 30,
            padding: 28,
            background: 'rgba(28, 19, 45, 0.86)',
            border: '1px solid rgba(126, 242, 255, 0.16)',
            boxShadow: '0 24px 80px rgba(9, 5, 17, 0.45)',
            display: 'grid',
            gap: 18,
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
                  Keep the first step simple: new users start secure setup, existing members go
                  straight into sign-in with Google first and backup access underneath.
                </div>
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
                    background:
                      'linear-gradient(135deg, rgba(33, 194, 198, 0.14), rgba(88, 141, 255, 0.12))',
                    border: '1px solid rgba(126, 242, 255, 0.22)',
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
                    onClick={onStartOnboarding}
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
                    Start Secure Onboarding
                  </button>
                </div>

                <div
                  style={{
                    borderRadius: 24,
                    padding: 22,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Existing Member Sign In</div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                    Use Google sign-in as the main path, or use backup email, phone, or user ID
                    access when needed.
                  </div>
                  <button
                    type="button"
                    onClick={() => setEntryView('signin')}
                    style={{
                      minHeight: 48,
                      borderRadius: 16,
                      border: '1px solid rgba(126, 242, 255, 0.2)',
                      background: 'rgba(54, 215, 255, 0.1)',
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
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      color: '#8cebff',
                      marginBottom: 8,
                    }}
                  >
                    Existing Member Sign In
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>
                    Google first, backup access second
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEntryView('landing');
                    setCredentialError('');
                  }}
                  style={{
                    minHeight: 42,
                    padding: '0 14px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.1)',
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
                  display: 'grid',
                  gap: 12,
                  padding: 18,
                  borderRadius: 22,
                  background:
                    'linear-gradient(135deg, rgba(54, 215, 255, 0.12), rgba(88, 141, 255, 0.08))',
                  border: '1px solid rgba(126, 242, 255, 0.2)',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>Sign in with Google</div>
                <div style={{ color: '#dff7fb', lineHeight: 1.7 }}>
                  This is the preferred sign-in path for ClearFlow and will be the main route for
                  restoring user workspaces.
                </div>
                <div id="google-btn-container" style={{ minHeight: 44 }} />
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
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['password', 'verification'] as BackupAuthMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setBackupAuthMode(mode);
                        setCredentialError('');
                      }}
                      style={{
                        minHeight: 42,
                        padding: '0 14px',
                        borderRadius: 14,
                        border:
                          backupAuthMode === mode
                            ? '1px solid rgba(126, 242, 255, 0.28)'
                            : '1px solid rgba(255,255,255,0.08)',
                        background:
                          backupAuthMode === mode
                            ? 'rgba(54, 215, 255, 0.14)'
                            : 'rgba(255,255,255,0.04)',
                        color: '#eff6fb',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {mode === 'password' ? 'Backup Sign In' : 'Use Verification'}
                    </button>
                  ))}
                </div>

                {backupAuthMode === 'password' ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ color: '#c5d7e3', fontSize: 14, lineHeight: 1.6 }}>
                      Enter your email, phone number, or user ID with your password.
                    </div>
                    <input
                      value={signInIdentifier}
                      onChange={(event) => setSignInIdentifier(event.target.value)}
                      placeholder="Email, phone number, or user ID"
                      style={inputStyle}
                    />
                    <input
                      value={signInPassword}
                      onChange={(event) => setSignInPassword(event.target.value)}
                      placeholder="Password"
                      type="password"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={handlePasswordSignIn}
                      disabled={isSubmitting}
                      style={{
                        ...secondaryButtonStyle,
                        background:
                          'linear-gradient(135deg, rgba(33, 194, 198, 0.85), rgba(72, 179, 214, 0.74))',
                        color: '#ffffff',
                      }}
                    >
                      {isSubmitting ? 'Signing In...' : 'Sign In'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ color: '#c5d7e3', fontSize: 14, lineHeight: 1.6 }}>
                      Use verification if you need backup access or want to set a password for a
                      local fallback account.
                    </div>
                    {!pendingCredentialAuth ? (
                      <>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {(['email', 'phone'] as LocalAuthContactType[]).map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setCredentialMode(option)}
                              style={{
                                minHeight: 42,
                                padding: '0 14px',
                                borderRadius: 14,
                                border:
                                  credentialMode === option
                                    ? '1px solid rgba(126, 242, 255, 0.28)'
                                    : '1px solid rgba(255,255,255,0.08)',
                                background:
                                  credentialMode === option
                                    ? 'rgba(54, 215, 255, 0.14)'
                                    : 'rgba(255,255,255,0.04)',
                                color: '#eff6fb',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {option === 'email' ? 'Use Email' : 'Use Phone'}
                            </button>
                          ))}
                        </div>
                        <input
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          placeholder="Full name (optional)"
                          style={inputStyle}
                        />
                        <input
                          value={contactValue}
                          onChange={(event) => setContactValue(event.target.value)}
                          placeholder={
                            credentialMode === 'email'
                              ? 'name@example.com'
                              : '+1 555 555 5555'
                          }
                          style={inputStyle}
                        />
                        <button
                          type="button"
                          onClick={() => void handleStartCredentialAuth()}
                          disabled={isSubmitting}
                          style={secondaryButtonStyle}
                        >
                          {isSubmitting ? 'Preparing...' : 'Send Verification Code'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            borderRadius: 16,
                            padding: 14,
                            background: 'rgba(54, 215, 255, 0.12)',
                            border: '1px solid rgba(126, 242, 255, 0.24)',
                            color: '#dff7fb',
                            lineHeight: 1.7,
                          }}
                        >
                          {pendingCredentialAuth.deliveryMessage ||
                            `Verification prepared for ${pendingCredentialAuth.maskedTarget}.`}
                          {pendingCredentialAuth.deliveryMode === 'in_app_preview' &&
                          pendingCredentialAuth.codePreview ? (
                            <>
                              <br />
                              Verification code: <strong>{pendingCredentialAuth.codePreview}</strong>
                            </>
                          ) : null}
                        </div>
                        <input
                          value={verificationCode}
                          onChange={(event) => setVerificationCode(event.target.value)}
                          placeholder="Enter 6-digit code"
                          style={inputStyle}
                        />
                        <input
                          value={backupUserHandle}
                          onChange={(event) => setBackupUserHandle(event.target.value)}
                          placeholder="User ID for backup sign-in (optional)"
                          style={inputStyle}
                        />
                        <input
                          value={backupPassword}
                          onChange={(event) => setBackupPassword(event.target.value)}
                          placeholder="Password for backup sign-in (optional)"
                          type="password"
                          style={inputStyle}
                        />
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={handleVerifyCredentialAuth}
                            disabled={isSubmitting}
                            style={{
                              ...secondaryButtonStyle,
                              flex: 1,
                              background:
                                'linear-gradient(135deg, rgba(33, 194, 198, 0.85), rgba(72, 179, 214, 0.74))',
                              color: '#ffffff',
                            }}
                          >
                            {isSubmitting ? 'Verifying...' : 'Verify and Continue'}
                          </button>
                          <button
                            type="button"
                            onClick={onCancelCredentialAuth}
                            style={{
                              minHeight: 46,
                              padding: '0 14px',
                              borderRadius: 16,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(255,255,255,0.04)',
                              color: '#eff6fb',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {credentialError ? (
                  <div
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.24)',
                      color: '#fecaca',
                      fontSize: 14,
                    }}
                  >
                    {credentialError}
                  </div>
                ) : null}
              </div>

              {!isConfigured ? (
                <button
                  type="button"
                  onClick={onDevLogin}
                  style={{
                    minHeight: 42,
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: '#cbd5e1',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Local build access
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
