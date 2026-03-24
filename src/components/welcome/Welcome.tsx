import React, { useEffect, useState } from 'react';
import type {
  LocalAuthChallenge,
  LocalAuthContactType,
} from '../../services/localAuth.service';
import { Logo } from '../logo/Logo';

interface WelcomeProps {
  initialView?: 'landing' | 'signin';
  isConfigured: boolean;
  onDevLogin: () => void;
  onStartOnboarding: () => void;
  renderGoogleButton: (elementId: string) => void;
  pendingCredentialAuth?: LocalAuthChallenge | null;
  onStartCredentialAuth?: (input: {
    contactType: LocalAuthContactType;
    contactValue: string;
    name?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onVerifyCredentialAuth?: (input: {
    code: string;
    userHandle?: string;
    password?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onSignInWithPassword?: (input: {
    identifier: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onCancelCredentialAuth?: () => void;
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
  const [entryView, setEntryView] = useState<'landing' | 'signin'>(initialView);
  const [backupMode, setBackupMode] = useState<'password' | 'code'>('password');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [passwordIdentifier, setPasswordIdentifier] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [contactType, setContactType] = useState<LocalAuthContactType>('email');
  const [contactValue, setContactValue] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupUserId, setBackupUserId] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const canUseDevAccess =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    if (isConfigured && entryView === 'signin') {
      renderGoogleButton('google-btn-container');
    }
  }, [entryView, isConfigured, renderGoogleButton]);

  const handlePasswordSignIn = async () => {
    if (!onSignInWithPassword) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsWorking(true);

    try {
      const result = await onSignInWithPassword({
        identifier: passwordIdentifier,
        password: passwordValue,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Unable to sign in with backup password.');
        return;
      }

      setStatusMessage('Backup sign-in accepted. Restoring workspace...');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRequestCode = async () => {
    if (!onStartCredentialAuth) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsWorking(true);

    try {
      const result = await onStartCredentialAuth({
        contactType,
        contactValue,
        name: displayName || undefined,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Unable to send a verification code.');
        return;
      }

      setStatusMessage('Verification code sent. Enter it below to continue.');
      setVerificationCode('');
    } finally {
      setIsWorking(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!onVerifyCredentialAuth) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsWorking(true);

    try {
      const result = await onVerifyCredentialAuth({
        code: verificationCode,
        userHandle: backupUserId || undefined,
        password: backupPassword || undefined,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Unable to verify that code.');
        return;
      }

      setStatusMessage('Verification accepted. Continuing into your workspace...');
    } finally {
      setIsWorking(false);
    }
  };

  const resetBackupState = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setVerificationCode('');
    setBackupUserId('');
    setBackupPassword('');
    onCancelCredentialAuth?.();
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
                  New members start secure onboarding. Existing members continue to the
                  Google-first sign-in step to restore their workspace.
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
                      'linear-gradient(180deg, rgba(54, 215, 255, 0.12), rgba(54, 215, 255, 0.05))',
                    border: '1px solid rgba(126, 242, 255, 0.24)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800 }}>New Member Signup</div>
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
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Existing Member Sign In</div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                    Continue to the secure sign-in step and use Google auth to restore your
                    account.
                  </div>
                  <button
                    type="button"
                    onClick={() => setEntryView('signin')}
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
                    Continue to Sign In
                  </button>
                </div>
              </div>
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
                    Existing Member Sign In
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
                    Restore your ClearFlow workspace
                  </div>
                  <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
                    Google sign-in is the primary path for existing members.
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
                Use Google to enter the workspace tied to your existing account and saved data.
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
                    Google sign-in is not configured in this environment yet. Backup access below
                    is still available so members can keep using the app.
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 14,
                  padding: 18,
                  borderRadius: 22,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>Backup Access</div>
                <div style={{ color: '#c5d7e3', lineHeight: 1.7 }}>
                  Use a backup password, or request a verification code by email or phone if you
                  need an alternate way in.
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[
                    { id: 'password' as const, label: 'Password Sign In' },
                    { id: 'code' as const, label: 'Verification Code' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setBackupMode(option.id);
                        setErrorMessage(null);
                        setStatusMessage(null);
                      }}
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 12,
                        border:
                          backupMode === option.id
                            ? '1px solid rgba(126, 242, 255, 0.34)'
                            : '1px solid rgba(255,255,255,0.12)',
                        background:
                          backupMode === option.id
                            ? 'rgba(54, 215, 255, 0.12)'
                            : 'rgba(255,255,255,0.04)',
                        color: '#eff6fb',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {backupMode === 'password' ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label
                        htmlFor="backup-identifier"
                        style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                      >
                        Email, phone, or user ID
                      </label>
                      <input
                        id="backup-identifier"
                        value={passwordIdentifier}
                        onChange={(event) => setPasswordIdentifier(event.target.value)}
                        placeholder="member@email.com, +15551234567, or your.userid"
                        style={{
                          width: '100%',
                          minHeight: 46,
                          borderRadius: 14,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(7, 10, 22, 0.62)',
                          color: '#fff',
                          padding: '0 14px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="backup-password"
                        style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                      >
                        Backup password
                      </label>
                      <input
                        id="backup-password"
                        type="password"
                        value={passwordValue}
                        onChange={(event) => setPasswordValue(event.target.value)}
                        placeholder="Enter your backup password"
                        style={{
                          width: '100%',
                          minHeight: 46,
                          borderRadius: 14,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(7, 10, 22, 0.62)',
                          color: '#fff',
                          padding: '0 14px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!passwordIdentifier.trim() || !passwordValue.trim() || isWorking}
                      onClick={handlePasswordSignIn}
                      style={{
                        minHeight: 46,
                        borderRadius: 16,
                        border: '1px solid rgba(126, 242, 255, 0.24)',
                        background:
                          'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: 14,
                        opacity:
                          !passwordIdentifier.trim() || !passwordValue.trim() || isWorking ? 0.6 : 1,
                      }}
                    >
                      {isWorking ? 'Signing In...' : 'Sign In with Backup Password'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {(['email', 'phone'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setContactType(option)}
                          style={{
                            minHeight: 40,
                            padding: '0 14px',
                            borderRadius: 12,
                            border:
                              contactType === option
                                ? '1px solid rgba(126, 242, 255, 0.34)'
                                : '1px solid rgba(255,255,255,0.12)',
                            background:
                              contactType === option
                                ? 'rgba(54, 215, 255, 0.12)'
                                : 'rgba(255,255,255,0.04)',
                            color: '#eff6fb',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {option === 'email' ? 'Email Code' : 'Phone Code'}
                        </button>
                      ))}
                    </div>

                    {!pendingCredentialAuth ? (
                      <>
                        <div>
                          <label
                            htmlFor="backup-contact"
                            style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                          >
                            {contactType === 'email' ? 'Email address' : 'Phone number'}
                          </label>
                          <input
                            id="backup-contact"
                            value={contactValue}
                            onChange={(event) => setContactValue(event.target.value)}
                            placeholder={
                              contactType === 'email' ? 'member@email.com' : '+1 555 123 4567'
                            }
                            style={{
                              width: '100%',
                              minHeight: 46,
                              borderRadius: 14,
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(7, 10, 22, 0.62)',
                              color: '#fff',
                              padding: '0 14px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="backup-display-name"
                            style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                          >
                            Name if this is your first backup sign-in
                          </label>
                          <input
                            id="backup-display-name"
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            placeholder="Optional for existing members"
                            style={{
                              width: '100%',
                              minHeight: 46,
                              borderRadius: 14,
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(7, 10, 22, 0.62)',
                              color: '#fff',
                              padding: '0 14px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!contactValue.trim() || isWorking}
                          onClick={handleRequestCode}
                          style={{
                            minHeight: 46,
                            borderRadius: 16,
                            border: '1px solid rgba(126, 242, 255, 0.24)',
                            background:
                              'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                            color: '#fff',
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontSize: 14,
                            opacity: !contactValue.trim() || isWorking ? 0.6 : 1,
                          }}
                        >
                          {isWorking ? 'Sending Code...' : 'Send Verification Code'}
                        </button>
                      </>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gap: 12,
                          padding: 16,
                          borderRadius: 18,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(126, 242, 255, 0.16)',
                        }}
                      >
                        <div style={{ color: '#dff7fb', lineHeight: 1.7 }}>
                          Code requested for <strong>{pendingCredentialAuth.maskedTarget}</strong>.
                          {pendingCredentialAuth.deliveryMessage ? (
                            <div style={{ marginTop: 6 }}>{pendingCredentialAuth.deliveryMessage}</div>
                          ) : null}
                        </div>
                        <div>
                          <label
                            htmlFor="verification-code"
                            style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                          >
                            Verification code
                          </label>
                          <input
                            id="verification-code"
                            value={verificationCode}
                            onChange={(event) => setVerificationCode(event.target.value)}
                            placeholder="6-digit code"
                            style={{
                              width: '100%',
                              minHeight: 46,
                              borderRadius: 14,
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(7, 10, 22, 0.62)',
                              color: '#fff',
                              padding: '0 14px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        {!pendingCredentialAuth.isExistingUser ? (
                          <>
                            <div>
                              <label
                                htmlFor="backup-user-id"
                                style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                              >
                                Backup user ID
                              </label>
                              <input
                                id="backup-user-id"
                                value={backupUserId}
                                onChange={(event) => setBackupUserId(event.target.value)}
                                placeholder="your.userid"
                                style={{
                                  width: '100%',
                                  minHeight: 46,
                                  borderRadius: 14,
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  background: 'rgba(7, 10, 22, 0.62)',
                                  color: '#fff',
                                  padding: '0 14px',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="backup-user-password"
                                style={{ display: 'block', marginBottom: 6, color: '#d9e7ef', fontSize: 14 }}
                              >
                                Backup password
                              </label>
                              <input
                                id="backup-user-password"
                                type="password"
                                value={backupPassword}
                                onChange={(event) => setBackupPassword(event.target.value)}
                                placeholder="Create a backup password"
                                style={{
                                  width: '100%',
                                  minHeight: 46,
                                  borderRadius: 14,
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  background: 'rgba(7, 10, 22, 0.62)',
                                  color: '#fff',
                                  padding: '0 14px',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </div>
                          </>
                        ) : null}
                        {pendingCredentialAuth.deliveryMode === 'in_app_preview' &&
                        pendingCredentialAuth.codePreview ? (
                          <div
                            style={{
                              borderRadius: 14,
                              padding: 14,
                              background: 'rgba(15, 118, 110, 0.18)',
                              border: '1px solid rgba(45, 212, 191, 0.2)',
                              color: '#d5fbf4',
                              lineHeight: 1.6,
                            }}
                          >
                            Preview code: <strong>{pendingCredentialAuth.codePreview}</strong>
                          </div>
                        ) : null}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            disabled={!verificationCode.trim() || isWorking}
                            onClick={handleVerifyCode}
                            style={{
                              minHeight: 46,
                              padding: '0 16px',
                              borderRadius: 16,
                              border: '1px solid rgba(126, 242, 255, 0.24)',
                              background:
                                'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
                              color: '#fff',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: 14,
                              opacity: !verificationCode.trim() || isWorking ? 0.6 : 1,
                            }}
                          >
                            {isWorking ? 'Verifying...' : 'Verify and Continue'}
                          </button>
                          <button
                            type="button"
                            onClick={resetBackupState}
                            style={{
                              minHeight: 46,
                              padding: '0 16px',
                              borderRadius: 16,
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(255,255,255,0.04)',
                              color: '#eff6fb',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            Start Over
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {errorMessage ? (
                  <div
                    style={{
                      borderRadius: 14,
                      padding: 14,
                      background: 'rgba(127, 29, 29, 0.24)',
                      border: '1px solid rgba(248, 113, 113, 0.24)',
                      color: '#fee2e2',
                      lineHeight: 1.6,
                    }}
                  >
                    {errorMessage}
                  </div>
                ) : null}

                {statusMessage ? (
                  <div
                    style={{
                      borderRadius: 14,
                      padding: 14,
                      background: 'rgba(15, 118, 110, 0.18)',
                      border: '1px solid rgba(45, 212, 191, 0.2)',
                      color: '#d5fbf4',
                      lineHeight: 1.6,
                    }}
                  >
                    {statusMessage}
                  </div>
                ) : null}
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
