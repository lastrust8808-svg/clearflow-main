import React, { useEffect, useState } from 'react';
import { Logo } from '../logo/Logo';

interface WelcomeProps {
  initialView?: 'landing' | 'signin';
  initialIntent?: 'new' | 'existing';
  lastKnownGoogleUser?: { name: string; email: string } | null;
  onDevLogin: () => void;
  onStartNewMember: () => void;
  onStartExistingMember: () => void;
  startGoogleSignIn: (
    mode?: 'new' | 'existing' | 'returning'
  ) => Promise<{ success: boolean; error?: string }>;
  authMessage?: string | null;
}

export const Welcome: React.FC<WelcomeProps> = ({
  lastKnownGoogleUser,
  onDevLogin,
  onStartNewMember,
  onStartExistingMember,
  startGoogleSignIn,
  authMessage,
}) => {
  const [launchMode, setLaunchMode] = useState<'new' | 'existing' | null>(null);
  const [launchError, setLaunchError] = useState('');
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 720
  );

  const canUseDevAccess =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsCompact(window.innerWidth < 720);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const launch = async (mode: 'new' | 'existing') => {
    setLaunchError('');
    setLaunchMode(mode);

    if (mode === 'new') {
      onStartNewMember();
    } else {
      onStartExistingMember();
    }

    const result = await startGoogleSignIn(
      mode === 'new' ? 'new' : lastKnownGoogleUser ? 'returning' : 'existing'
    );

    if (!result.success) {
      setLaunchError(result.error || 'Secure Google access could not start.');
      setLaunchMode(null);
    }
  };

  const cardStyle: React.CSSProperties = {
    borderRadius: 24,
    padding: isCompact ? 20 : 26,
    border: '1px solid rgba(126,242,255,0.16)',
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))',
    display: 'grid',
    gap: 12,
    minHeight: 210,
    alignContent: 'space-between',
  };

  const buttonStyle = (primary = false): React.CSSProperties => ({
    minHeight: 52,
    borderRadius: 15,
    border: primary
      ? '1px solid rgba(126,242,255,0.3)'
      : '1px solid rgba(255,255,255,0.12)',
    background: primary
      ? 'linear-gradient(135deg, rgba(33,194,198,0.95), rgba(88,141,255,0.86))'
      : 'rgba(255,255,255,0.045)',
    color: '#ffffff',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 15,
    padding: '0 16px',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(54,215,255,0.18), transparent 28%), radial-gradient(circle at 85% 15%, rgba(88,141,255,0.13), transparent 24%), linear-gradient(135deg, #120816 0%, #1b1026 45%, #0c1224 100%)',
        color: '#fff6fd',
        fontFamily: '"Trebuchet MS", "Avenir Next", "Segoe UI", sans-serif',
        padding: isCompact ? '20px 14px 30px' : '34px 20px 42px',
      }}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          margin: '0 auto',
          display: 'grid',
          gap: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: isCompact ? '4px 4px 10px' : '4px 8px 12px',
          }}
        >
          <Logo height={isCompact ? 54 : 66} />
          <div>
            <div
              style={{
                color: '#8cebff',
                fontSize: 12,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              ClearFlow
            </div>
            <div style={{ color: '#c5d7e3', fontSize: 13 }}>
              Secure operating system for entities, records, accounting, and treasury.
            </div>
          </div>
        </header>

        <section
          style={{
            borderRadius: isCompact ? 26 : 34,
            padding: isCompact ? 22 : 34,
            background:
              'linear-gradient(180deg, rgba(24,18,42,0.86), rgba(14,16,33,0.84))',
            border: '1px solid rgba(126,242,255,0.16)',
            boxShadow: '0 28px 100px rgba(9,5,17,0.46)',
            display: 'grid',
            gap: 22,
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                fontSize: isCompact ? 34 : 48,
                fontWeight: 850,
                lineHeight: 1.05,
              }}
            >
              Welcome to ClearFlow.
            </div>
            <div
              style={{
                color: '#d7e6ee',
                fontSize: isCompact ? 16 : 18,
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Choose how you are entering. New clients complete secure onboarding and the
              required membership agreements before the workspace is opened. Existing clients
              sign in to the workspace already on file.
            </div>
          </div>

          {authMessage || launchError ? (
            <div
              style={{
                borderRadius: 14,
                padding: '12px 14px',
                border: '1px solid rgba(251,191,36,0.25)',
                background: 'rgba(120,53,15,0.18)',
                color: '#fde68a',
                lineHeight: 1.5,
              }}
            >
              {launchError || authMessage}
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <div style={cardStyle}>
              <div>
                <div
                  style={{
                    color: '#8cebff',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1.6,
                    textTransform: 'uppercase',
                  }}
                >
                  First Time Here
                </div>
                <div style={{ fontSize: 26, fontWeight: 850, marginTop: 8 }}>
                  New Client
                </div>
                <div style={{ color: '#c5d7e3', lineHeight: 1.55, marginTop: 8 }}>
                  Establish your identity, sign the membership and security agreements, and
                  create your ClearFlow workspace.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void launch('new')}
                style={buttonStyle(true)}
                disabled={launchMode !== null}
              >
                {launchMode === 'new' ? 'Opening Secure Onboarding…' : 'New Client'}
              </button>
            </div>

            <div style={cardStyle}>
              <div>
                <div
                  style={{
                    color: '#f7d37b',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1.6,
                    textTransform: 'uppercase',
                  }}
                >
                  Returning
                </div>
                <div style={{ fontSize: 26, fontWeight: 850, marginTop: 8 }}>
                  Existing Client
                </div>
                <div style={{ color: '#c5d7e3', lineHeight: 1.55, marginTop: 8 }}>
                  {lastKnownGoogleUser
                    ? `Continue securely as ${lastKnownGoogleUser.name || lastKnownGoogleUser.email}.`
                    : 'Sign in to an existing ClearFlow account and load the retained workspace.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void launch('existing')}
                style={buttonStyle(false)}
                disabled={launchMode !== null}
              >
                {launchMode === 'existing' ? 'Opening Secure Login…' : 'Existing Client'}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              color: '#9fb2bf',
              fontSize: 12,
            }}
          >
            <div>
              <a href="/terms" style={{ color: '#9fe8ff' }}>
                Terms
              </a>
              {' · '}
              <a href="/privacy" style={{ color: '#9fe8ff' }}>
                Privacy
              </a>
            </div>
            {canUseDevAccess ? (
              <button
                type="button"
                onClick={onDevLogin}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Dev Access
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};
