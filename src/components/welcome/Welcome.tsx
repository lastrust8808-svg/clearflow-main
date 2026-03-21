import React, { useEffect } from 'react';
import { Logo } from '../logo/Logo';

interface WelcomeProps {
  isConfigured: boolean;
  onDevLogin: () => void;
  onStartOnboarding: () => void;
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
  isConfigured,
  onDevLogin,
  onStartOnboarding,
  renderGoogleButton,
}) => {
  useEffect(() => {
    if (isConfigured) {
      renderGoogleButton('google-btn-container');
    }
  }, [isConfigured, renderGoogleButton]);

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
              asset control, transaction visibility, compliance tracking, document vaulting, and
              AI-guided workflow generation.
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
              Enter the ClearFlow workspace
            </div>
            <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
              Sign in with Google to restore your workspace, or start onboarding to establish
              the entity, profile, and operating setup for a new secure account.
            </div>
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
            Launch a workspace that is meant to grow into a true wealth, accounting, compliance,
            records, and operations platform rather than another shallow dashboard.
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
                Google sign-in is not configured yet in this environment, so dev login is still
                available for local build work.
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
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
          </div>
        </section>
      </div>
    </div>
  );
};
