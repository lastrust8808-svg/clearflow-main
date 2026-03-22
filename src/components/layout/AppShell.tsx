import type { ReactNode } from 'react';
import type { AppSection, WorkspaceSettingsRecord } from '../../types/core';

interface AppShellProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  workspaceSettings: WorkspaceSettingsRecord;
  children: ReactNode;
}

const navGroups: Array<{
  title: string;
  items: Array<{ id: AppSection; label: string; hint: string }>;
}> = [
  {
    title: 'Operate',
    items: [
      { id: 'overview', label: 'Overview', hint: 'Command center' },
      { id: 'entities', label: 'Entities', hint: 'Formation and authority' },
      { id: 'accounting', label: 'Accounting', hint: 'ERP and cash flow' },
      { id: 'ledger', label: 'Ledger & Treasury', hint: 'Books and reserve control' },
    ],
  },
  {
    title: 'Control',
    items: [
      { id: 'assets', label: 'Assets & Reserve', hint: 'Assets, wallets, custody' },
      { id: 'transactions', label: 'Transactions', hint: 'Settlement and movement' },
      { id: 'compliance', label: 'Compliance & Reports', hint: 'Review, reporting, filings' },
      { id: 'documents', label: 'Documents & Vault', hint: 'Evidence and packets' },
    ],
  },
  {
    title: 'Build',
    items: [
      { id: 'aiStudio', label: 'AI & Resource Studio', hint: 'Generators and libraries' },
      { id: 'settings', label: 'Settings', hint: 'Workspace and access' },
    ],
  },
];

export default function AppShell({
  activeSection,
  onSectionChange,
  workspaceSettings,
  children,
}: AppShellProps) {
  const themePaletteByMode: Record<
    WorkspaceSettingsRecord['themeMode'],
    {
      bg: string;
      bgSecondary: string;
      panel: string;
      panelStrong: string;
      border: string;
      borderStrong: string;
      text: string;
      muted: string;
      accentSoft: string;
      accentCool: string;
      accentGold: string;
      shadow: string;
      pageBackground: string;
      sidebarBackground: string;
      sparkleOpacity: number;
    }
  > = {
    ocean_luxe: {
      bg: '#120816',
      bgSecondary: '#20112b',
      panel: '#1a1b31',
      panelStrong: '#202643',
      border: 'rgba(126, 242, 255, 0.18)',
      borderStrong: 'rgba(97, 218, 251, 0.45)',
      text: '#fff6fd',
      muted: '#c5d7e3',
      accentSoft: '#8cebff',
      accentCool: '#7ef2ff',
      accentGold: '#f7d37b',
      shadow: '0 10px 28px rgba(9, 5, 17, 0.22)',
      pageBackground: 'linear-gradient(180deg, #10172a 0%, #11182c 100%)',
      sidebarBackground: '#11192b',
      sparkleOpacity: 0,
    },
    midnight_gold: {
      bg: '#141010',
      bgSecondary: '#231818',
      panel: '#20191d',
      panelStrong: '#2b2227',
      border: 'rgba(247, 211, 123, 0.18)',
      borderStrong: 'rgba(247, 211, 123, 0.46)',
      text: '#fff7ef',
      muted: '#d7cab8',
      accentSoft: '#ffe4a3',
      accentCool: '#ffd980',
      accentGold: '#f7d37b',
      shadow: '0 10px 28px rgba(15, 7, 7, 0.22)',
      pageBackground: 'linear-gradient(180deg, #171215 0%, #141316 100%)',
      sidebarBackground: '#181519',
      sparkleOpacity: 0,
    },
    glitter_pop: {
      bg: '#150c21',
      bgSecondary: '#271638',
      panel: '#221934',
      panelStrong: '#2b2140',
      border: 'rgba(132, 230, 255, 0.2)',
      borderStrong: 'rgba(132, 230, 255, 0.46)',
      text: '#fff8ff',
      muted: '#d8d0f2',
      accentSoft: '#9ef5ff',
      accentCool: '#79dcff',
      accentGold: '#ffd9a3',
      shadow: '0 10px 28px rgba(20, 8, 34, 0.24)',
      pageBackground: 'linear-gradient(180deg, #181224 0%, #151928 100%)',
      sidebarBackground: '#17152a',
      sparkleOpacity: 0,
    },
    quiet_stewardship: {
      bg: '#0d1317',
      bgSecondary: '#162127',
      panel: '#162126',
      panelStrong: '#1b2a31',
      border: 'rgba(126, 242, 255, 0.14)',
      borderStrong: 'rgba(126, 242, 255, 0.32)',
      text: '#eff8f7',
      muted: '#bfd1d0',
      accentSoft: '#9de7de',
      accentCool: '#7bdad0',
      accentGold: '#dccf92',
      shadow: '0 10px 28px rgba(5, 12, 14, 0.18)',
      pageBackground: 'linear-gradient(180deg, #0f171c 0%, #10181d 100%)',
      sidebarBackground: '#10181d',
      sparkleOpacity: 0,
    },
  };

  const themePalette = themePaletteByMode[workspaceSettings.themeMode];
  const accent = workspaceSettings.preferredAccentColor || '#36d7ff';

  return (
    <div
      style={{
        '--cf-bg': themePalette.bg,
        '--cf-bg-secondary': themePalette.bgSecondary,
        '--cf-panel': themePalette.panel,
        '--cf-panel-strong': themePalette.panelStrong,
        '--cf-border': themePalette.border,
        '--cf-border-strong': themePalette.borderStrong,
        '--cf-text': themePalette.text,
        '--cf-muted': themePalette.muted,
        '--cf-accent': accent,
        '--cf-accent-soft': themePalette.accentSoft,
        '--cf-accent-cool': themePalette.accentCool,
        '--cf-accent-gold': themePalette.accentGold,
        '--cf-shadow': themePalette.shadow,
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        background: themePalette.pageBackground,
        color: 'var(--cf-text)',
        fontFamily: '"Trebuchet MS", "Avenir Next", "Segoe UI", sans-serif',
      }}
    >
      <aside
        style={{
          position: 'relative',
          zIndex: 1,
          borderRight: '1px solid var(--cf-border)',
          padding: '24px 16px',
          background: themePalette.sidebarBackground,
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: 2.4,
              color: 'var(--cf-accent-soft)',
              marginBottom: 8,
            }}
          >
            ClearFlow
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.4 }}>Core OS</div>
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 14,
              background:
                'linear-gradient(135deg, rgba(54, 215, 255, 0.18), rgba(88, 141, 255, 0.1))',
              border: '1px solid rgba(126, 242, 255, 0.22)',
              color: 'var(--cf-muted)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Wealth OS with polished controls, cash flow clarity, and a little sparkle.
          </div>
        </div>

        <nav style={{ display: 'grid', gap: 16 }}>
          {navGroups.map((group) => (
            <div key={group.title} style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1.7,
                  color: 'rgba(255,255,255,0.52)',
                  padding: '0 8px',
                }}
              >
                {group.title}
              </div>
              {group.items.map((item) => {
                const isActive = item.id === activeSection;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSectionChange(item.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid',
                      borderColor: isActive ? 'var(--cf-border-strong)' : 'transparent',
                      background: isActive
                        ? 'rgba(33, 120, 168, 0.42)'
                        : 'rgba(255, 255, 255, 0.03)',
                      color: 'var(--cf-text)',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: isActive ? 700 : 500,
                      boxShadow: 'none',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <span>{item.label}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.6)',
                        fontWeight: 500,
                      }}
                    >
                      {item.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 24,
          background: 'transparent',
        }}
      >
        {children}
      </main>
    </div>
  );
}



