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

const featureHighlights = [
  'Multi-entity operating system for trusts, businesses, fiduciary boards, and reserve structures',
  'ERP accounting with invoices, bills, remittances, bank feed, journals, and reconciliation',
  'Treasury, settlement, bond, collateral, wallet, and reserve control layers in one workspace',
  'Document vault, compliance review, AI generation, and retained proof chains built into every workflow',
];

const membershipTiers = [
  {
    name: 'Steward',
    price: '$39/mo',
    autopayPrice: '$35.10/mo',
    subtitle: 'For first boards and solo operators',
    emphasis: 'Start with one entity, one operator, and a clean operating base.',
    features: [
      '30 days free',
      'Core entity setup and authority flow',
      'Accounting basics, documents, and AI learning hub',
      'Rewards credits and referral link',
    ],
  },
  {
    name: 'Operator',
    price: '$89/mo',
    autopayPrice: '$80.10/mo',
    subtitle: 'Best for active businesses and trust administration',
    emphasis: 'This is the primary plan for most real users.',
    featured: true,
    features: [
      '30 days free',
      'Full ERP accounting and remittance flow',
      'Bank feed, wallet, reserve, and settlement visibility',
      'Multi-entity workflow, richer AI/reporting, and deeper resource access',
    ],
  },
  {
    name: 'Crown',
    price: '$179/mo',
    autopayPrice: '$161.10/mo',
    subtitle: 'For treasury-heavy, fiduciary, and multi-entity operators',
    emphasis: 'Advanced control, reporting, reserve, capital, and white-glove depth.',
    features: [
      '30 days free',
      'Everything in Operator',
      'Advanced treasury, reserve, bond, collateral, and strategy layers',
      'Priority support and premium operating surfaces',
    ],
  },
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
          gap: 28,
          padding: '32px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Logo height={64} />
            <div>
              <div style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: '#8cebff' }}>
                ClearFlow Operating System
              </div>
              <div style={{ color: '#c5d7e3', fontSize: 14 }}>
                Integrated financial management, treasury, records, and execution control
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void launchGoogle(lastKnownGoogleUser ? 'returning' : 'existing')}
            style={{
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#eff6fb',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            disabled={isLaunchingGoogle}
          >
            {isLaunchingGoogle && signInIntent === 'existing'
              ? 'Opening Login...'
              : 'Existing User Login'}
          </button>
        </div>

        <section
          style={{
            borderRadius: 32,
            padding: 32,
            background: 'rgba(24, 18, 42, 0.74)',
            border: '1px solid rgba(126, 242, 255, 0.16)',
            boxShadow: '0 24px 80px rgba(9, 5, 17, 0.45)',
            backdropFilter: 'blur(18px)',
            display: 'grid',
            gap: 28,
          }}
        >
          <div style={{ display: 'grid', gap: 18 }}>
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
                justifySelf: 'start',
              }}
            >
              30 Days Free To Start
            </div>
            <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.02, maxWidth: 920 }}>
              The operating system for trusts, businesses, treasury, records, and cash flow.
            </div>
            <div
              style={{
                fontSize: 18,
                lineHeight: 1.8,
                color: '#d9e7ef',
                maxWidth: 900,
              }}
            >
              ClearFlow combines the most useful parts of accounting ERP, treasury control,
              compliance workflow, vault retention, remittance operations, reserve management,
              wallet connectivity, and AI-guided document systems into one platform.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {featureHighlights.map((item) => (
              <div
                key={item}
                style={{
                  borderRadius: 20,
                  padding: '16px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#edf6fb',
                  lineHeight: 1.6,
                }}
              >
                {item}
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
            gap: 22,
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
              Memberships
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>
              Choose the operating tier that matches your workload
            </div>
            <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
              Every plan starts with a free 30-day trial. Connect bank autopay after trial to save
              10% on monthly billing.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {membershipTiers.map((tier) => (
              <div
                key={tier.name}
                style={{
                  borderRadius: 24,
                  padding: 22,
                  background: tier.featured
                    ? 'linear-gradient(180deg, rgba(54, 215, 255, 0.14), rgba(88, 141, 255, 0.08))'
                    : 'rgba(255,255,255,0.03)',
                  border: tier.featured
                    ? '1px solid rgba(126, 242, 255, 0.24)'
                    : '1px solid rgba(255,255,255,0.08)',
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{tier.name}</div>
                  <div style={{ color: '#9fe8ff', fontWeight: 700 }}>{tier.price}</div>
                  <div style={{ color: '#f7d37b', fontSize: 13 }}>
                    {tier.autopayPrice} with connected bank autopay
                  </div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.6 }}>{tier.subtitle}</div>
                  <div style={{ color: '#b9cbda', lineHeight: 1.6 }}>{tier.emphasis}</div>
                </div>
                <div style={{ display: 'grid', gap: 8, color: '#e8f2f8', lineHeight: 1.55 }}>
                  {tier.features.map((feature) => (
                    <div key={feature}>{feature}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>

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
                  Free Trial Sign Up
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
                  Start your 30-day membership trial
                </div>
                <div style={{ marginTop: 12, color: '#c5d7e3', lineHeight: 1.7 }}>
                  New users start with Google, review the tiers, and enter ClearFlow free for 30
                  days before paid billing begins.
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
                  <div style={{ fontSize: 22, fontWeight: 800 }}>New Member Sign Up</div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                    Continue with Google to choose your membership, begin free for 30 days, and
                    complete your operator profile.
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
                      : 'Start Free 30-Day Trial'}
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
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Why membership matters</div>
                  <div style={{ color: '#d9e7ef', lineHeight: 1.7 }}>
                    Membership unlocks the full operating system: entity administration, ERP,
                    reserve and wallet control, remittance flow, compliance records, AI tools, and
                    the resource library in one place.
                  </div>
                  <div style={{ color: '#b9cbda', lineHeight: 1.6, fontSize: 14 }}>
                    Referral rewards only unlock after referred members become retained paid users.
                    Bank autopay discount begins after the trial period.
                  </div>
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

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingTop: 4,
                }}
              >
                <a
                  href="/privacy"
                  style={{
                    color: '#9fe8ff',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  Privacy
                </a>
                <span style={{ color: 'rgba(255,255,255,0.22)' }}>|</span>
                <a
                  href="/terms"
                  style={{
                    color: '#9fe8ff',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  Terms
                </a>
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
