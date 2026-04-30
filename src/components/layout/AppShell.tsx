import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppSection, EntityRecord, WorkspaceSettingsRecord } from '../../types/core';
import type { User } from '../../types/app.models';
import { buildEntityWorkspaceView } from '../../services/entityWorkspace.service';
import { subnavItems } from '../accounting/accountingUtils';

interface AppShellProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  workspaceSettings: WorkspaceSettingsRecord;
  currentUser: User | null;
  entities: EntityRecord[];
  activeEntityId: string | null;
  onActiveEntityChange: (entityId: string | null) => void;
  hasDriveAccess: boolean;
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
      { id: 'investments', label: 'Investments', hint: 'Strategy, 1031, funding' },
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

const clearFlowLogoDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" preserveAspectRatio="xMinYMid meet" role="img" aria-label="ClearFlow">
  <defs>
    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="50%" stop-color="#005A9E"/>
      <stop offset="50%" stop-color="#4CAF50"/>
    </linearGradient>
    <clipPath id="circleClip"><circle cx="0" cy="0" r="48"/></clipPath>
  </defs>
  <g transform="translate(50, 50)">
    <g clip-path="url(#circleClip)">
      <rect x="-50" y="-50" width="100" height="100" fill="url(#logoGradient)"/>
      <path d="M -45,-18 C -20,-42 25,12 45,-8" stroke="#ffffff" stroke-width="11" stroke-linecap="round" fill="none"/>
      <path d="M -45,18 C -25,42 15,-18 45,8" stroke="#ffffff" stroke-width="11" stroke-linecap="round" fill="none"/>
    </g>
  </g>
  <text x="112" y="70" font-family="Saira, Segoe UI, sans-serif" font-weight="700" font-style="italic" font-size="54" letter-spacing="-2">
    <tspan fill="#005A9E">Clear</tspan><tspan fill="#4CAF50">Flow</tspan>
  </text>
</svg>
`)}`;

const sectionQuickActions: Record<
  AppSection,
  Array<{ label: string; hash: string; description: string }>
> = {
  overview: [
    { label: 'Start Remittance', hash: '#accounting:new-remittance', description: 'Enter a bill or coupon-backed remittance source' },
    { label: 'Upload Document', hash: '#documents:upload', description: 'Send a file into the vault' },
    { label: 'Add Entity', hash: '#entities:new', description: 'Create and connect a new entity' },
  ],
  entities: [
    { label: 'Add Entity', hash: '#entities:new', description: 'Create a new profile' },
    { label: 'Open Accounting', hash: '#accounting:dashboard', description: 'Continue ERP setup' },
    { label: 'Open Documents', hash: '#documents', description: 'Review packets and evidence' },
  ],
  accounting: [
    { label: 'Accounting Home', hash: '#accounting:dashboard', description: 'Open the ERP overview and work sections' },
    { label: 'Remittance Intake', hash: '#accounting:new-remittance', description: 'Start from a bill or coupon presentment' },
    { label: 'Bank Feed', hash: '#accounting:bankFeed', description: 'Sync or post bank activity' },
  ],
  ledger: [
    { label: 'Open Treasury', hash: '#ledger', description: 'Review private reserve posture' },
    { label: 'Settlement Desk', hash: '#transactions', description: 'Continue obligation execution' },
    { label: 'Documents', hash: '#documents', description: 'Open supporting memos and proofs' },
  ],
  investments: [
    { label: 'Deal Analyzer', hash: '#investments:real-estate', description: 'Estimate costs, ROI, debt, and hold period' },
    { label: '1031 Packet', hash: '#investments:1031', description: 'Stage a like-kind exchange checklist and packet' },
    { label: 'Funding Paths', hash: '#investments:funding', description: 'Review capital stack and short-term placement options' },
  ],
  assets: [
    { label: 'Wallet Reserve', hash: '#assets', description: 'Review custody and reserve assets' },
    { label: 'Bank Feed', hash: '#accounting:bankFeed', description: 'Connect external cash flows' },
    { label: 'Compliance', hash: '#compliance', description: 'Review digital asset posture' },
  ],
  transactions: [
    { label: 'Remittance Intake', hash: '#accounting:new-remittance', description: 'Create a presentment-backed settlement source' },
    { label: 'Documents', hash: '#documents', description: 'Open linked packets' },
    { label: 'Rails & Codes', hash: '#accounting:railOps', description: 'Check movement identifiers' },
  ],
  compliance: [
    { label: 'Rails & Codes', hash: '#accounting:railOps', description: 'Check movement identifiers' },
    { label: 'Release Queue', hash: '#accounting:payments', description: 'Resolve held settlements' },
    { label: 'Documents', hash: '#documents', description: 'Open filing and support packets' },
  ],
  documents: [
    { label: 'Upload', hash: '#documents:upload', description: 'Add a new vault file' },
    { label: 'Accounting', hash: '#accounting:dashboard', description: 'Return to ERP workflow' },
    { label: 'Compliance', hash: '#compliance', description: 'Review linked control items' },
  ],
  aiStudio: [
    { label: 'Settlement Audit', hash: '#aiStudio', description: 'Generate a rail audit packet' },
    { label: 'Documents', hash: '#documents', description: 'Open recent studio outputs' },
    { label: 'Compliance', hash: '#compliance', description: 'Review filing and support tags' },
  ],
  settings: [
    { label: 'Documents', hash: '#documents', description: 'Review storage posture' },
    { label: 'AI Studio', hash: '#aiStudio', description: 'Open generators and reports' },
    { label: 'Overview', hash: '#overview', description: 'Return to operating inbox' },
  ],
};

const RECENT_ROUTE_STORAGE_KEY = 'clearflow-shell-recent-routes-v1';
const PINNED_ROUTE_STORAGE_KEY = 'clearflow-shell-pinned-routes-v1';
function goToHash(hash: string) {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }

  window.location.hash = hash;
}

function formatRouteLabel(hashValue: string, activeSection: AppSection) {
  if (!hashValue || hashValue === `#${activeSection}`) {
    return 'Desk Home';
  }

  if (hashValue.startsWith('#accounting:')) {
    const subroute = hashValue.replace('#accounting:', '');
    const actionLabel = subnavItems.find((item) => item.id === subroute)?.label;
    if (actionLabel) {
      return actionLabel;
    }

    return subroute
      .replace(/^new-/, 'new ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (value) => value.toUpperCase());
  }

  if (hashValue.startsWith('#documents:')) {
    const docTarget = hashValue.replace('#documents:', '');
    return docTarget === 'upload' ? 'Upload Document' : 'Focused Vault Record';
  }

  if (hashValue.startsWith('#entities:')) {
    const entityTarget = hashValue.replace('#entities:', '');
    return entityTarget === 'new' ? 'Add Entity' : 'Entity Workflow';
  }

  return hashValue
    .replace('#', '')
    .replace(/:/g, ' / ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export default function AppShell({
  activeSection,
  onSectionChange,
  workspaceSettings,
  currentUser,
  entities,
  activeEntityId,
  onActiveEntityChange,
  hasDriveAccess,
  children,
}: AppShellProps) {
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash
  );
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1180
  );
  const [launcherQuery, setLauncherQuery] = useState('');
  const [recentRoutes, setRecentRoutes] = useState<Array<{ hash: string; label: string }>>([]);
  const [pinnedRoutes, setPinnedRoutes] = useState<Array<{ hash: string; label: string }>>([]);
  const showUtilityPanels = false;
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
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
  const activeItem =
    navGroups.flatMap((group) => group.items).find((item) => item.id === activeSection) ||
    navGroups[0].items[0];
  const activeEntity = activeEntityId
    ? entities.find((entity) => entity.id === activeEntityId) || null
    : null;
  const activeEntityWorkspace = activeEntity
    ? buildEntityWorkspaceView({
        entity: activeEntity,
        currentGoogleEmail: currentUser?.email,
        hasDriveAccess,
      })
    : null;
  const activeRouteLabel = useMemo(
    () => formatRouteLabel(currentHash, activeSection),
    [activeSection, currentHash]
  );
  const isSectionSubroute = useMemo(
    () => Boolean(currentHash && currentHash !== `#${activeSection}`),
    [activeSection, currentHash]
  );
  const isCurrentRoutePinned = useMemo(
    () => pinnedRoutes.some((route) => route.hash === currentHash),
    [currentHash, pinnedRoutes]
  );
  const quickActions = sectionQuickActions[activeSection];
  const resumeRoutes = useMemo(
    () => recentRoutes.filter((route) => route.hash !== currentHash).slice(0, 3),
    [currentHash, recentRoutes]
  );
  const launcherItems = useMemo(
    () => [
      ...navGroups.flatMap((group) =>
        group.items.map((item) => ({
          label: item.label,
          hash: `#${item.id}`,
          description: item.hint,
          category: group.title,
        }))
      ),
      ...Object.entries(sectionQuickActions).flatMap(([sectionId, actions]) =>
        actions.map((action) => ({
          label: action.label,
          hash: action.hash,
          description: action.description,
          category: `${sectionId} actions`,
        }))
      ),
    ],
    []
  );
  const filteredLauncherItems = useMemo(() => {
    const normalized = launcherQuery.trim().toLowerCase();
    const baseItems = normalized
      ? launcherItems.filter(
          (item) =>
            item.label.toLowerCase().includes(normalized) ||
            item.description.toLowerCase().includes(normalized) ||
            item.category.toLowerCase().includes(normalized)
        )
      : launcherItems.slice(0, 10);

    return baseItems
      .filter(
        (item, index, collection) =>
          collection.findIndex((candidate) => candidate.hash === item.hash) === index
      )
      .slice(0, 8);
  }, [launcherItems, launcherQuery]);
  const palettePinnedRoutes = useMemo(() => pinnedRoutes.slice(0, 4), [pinnedRoutes]);
  const paletteRecentRoutes = useMemo(
    () =>
      recentRoutes
        .filter((route) => route.hash !== currentHash)
        .filter((route) => !pinnedRoutes.some((item) => item.hash === route.hash))
        .slice(0, 4),
    [currentHash, pinnedRoutes, recentRoutes]
  );
  const paletteResults = useMemo(
    () => [
      ...(currentHash ? [{ hash: currentHash, label: activeRouteLabel, category: 'Current View' }] : []),
      ...palettePinnedRoutes.map((route) => ({ ...route, category: 'Pinned' })),
      ...paletteRecentRoutes.map((route) => ({ ...route, category: 'Recent' })),
      ...filteredLauncherItems.map((item) => ({
        hash: item.hash,
        label: item.label,
        category: item.category,
      })),
    ].filter(
      (item, index, collection) =>
        collection.findIndex((candidate) => candidate.hash === item.hash) === index
    ),
    [activeRouteLabel, currentHash, filteredLauncherItems, palettePinnedRoutes, paletteRecentRoutes]
  );
  const launcherResultCount = filteredLauncherItems.length;
  const routeMemoryCount = pinnedRoutes.length + recentRoutes.length;
  const activeEntityNeedsAuthority =
    Boolean(activeEntity?.authorityTransactionsPaused) ||
    activeEntity?.authorityProofStatus === 'missing' ||
    activeEntity?.authorityProofStatus === 'review' ||
    activeEntity?.authorityProofStatus === 'mismatch';
  const nextGuidance = activeEntity
    ? activeEntityNeedsAuthority
      ? {
          label: 'Finish authority review',
          description:
            activeEntity.authorityProofStatus === 'mismatch'
              ? 'Names or signer proof need follow-up before external transactions can be released.'
              : 'This entity can keep collecting data, but release should wait until authority proof is cleared.',
          hash: '#entities',
        }
      : !activeEntityWorkspace?.storageEmail && hasDriveAccess
        ? {
            label: 'Map entity storage',
            description:
              'Finish the storage mapping so uploads, packets, and routing stay on the right board.',
            hash: '#entities',
          }
        : {
            label: 'Workspace ready',
            description:
              'This board is ready for accounting, documents, connected accounts, and execution workflow.',
            hash: `#${activeSection}`,
          }
    : entities.length === 0
      ? {
          label: 'Add your first entity',
          description:
            'Create the first entity so ClearFlow can guide accounting, documents, and authority from a real board.',
          hash: '#entities:new',
        }
      : {
          label: 'Select an entity board',
          description:
            'Choose an entity when you want a focused board for its records, accounting, and authority posture.',
          hash: '#entities',
        };
  const attentionItems = [
    entities.length === 0
      ? {
          title: 'Add your first entity',
          detail: 'Create one board first so records, accounting, and authority have a real home.',
          hash: '#entities:new',
        }
      : null,
    activeEntityNeedsAuthority
      ? {
          title: 'Authority review is holding release',
          detail: 'Data entry can continue, but external release and sensitive onboarding should wait until proof is cleared.',
          hash: '#entities',
        }
      : null,
    entities.length > 0 && !activeEntityId
      ? {
          title: 'Choose an entity for focused work',
          detail: 'A focused board keeps the desk scoped to the right records, accounts, and controls.',
          hash: '#entities',
        }
      : null,
    hasDriveAccess
      ? null
      : {
          title: 'Connect Drive for smoother routing',
          detail: 'Uploads, generated packets, and board storage routing work better once Drive access is connected.',
          hash: '#settings',
        },
  ].filter((item): item is { title: string; detail: string; hash: string } => Boolean(item));
  const attentionActionLabel = (hash: string) => {
    if (hash === '#entities:new') return 'Start entity setup';
    if (hash === '#entities') return 'Open entity board';
    if (hash === '#settings') return 'Connect storage';
    return 'Open setup';
  };
  const learningRoute = '#aiStudio';
  const sectionSummaryById: Record<AppSection, string> = {
    overview: 'Live operating view across your desks, filings, rail posture, and next actions.',
    entities: 'Formation, authority, ownership, and establishment records for every profile.',
    accounting: 'ERP intake, receivables, payables, payroll, bank flows, and reconciliations.',
    ledger: 'Private reserve, treasury movement, and internal book control surfaces.',
    investments: 'Investment education, deal planning, 1031 exchange packets, and strategy simulations.',
    assets: 'Custody, wallets, reserves, digital holdings, and asset support records.',
    transactions: 'Settlement, performance, obligations, remittance, and movement execution.',
    compliance: 'Review queues, filings, controls, and reporting follow-through.',
    documents: 'Vault routing, retained records, user-owned files, and generated packets.',
    aiStudio: 'Generators, research, search, reporting, and operational tool launchers.',
    settings: 'Workspace behavior, storage posture, integrations, and access configuration.',
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const applyWindowState = () => {
      setCurrentHash(window.location.hash);
      const nextCompactLayout = window.innerWidth < 1180;
      setIsCompactLayout(nextCompactLayout);
    };

    try {
      const rawRecentRoutes = window.localStorage.getItem(RECENT_ROUTE_STORAGE_KEY);
      if (rawRecentRoutes) {
        setRecentRoutes(JSON.parse(rawRecentRoutes) as Array<{ hash: string; label: string }>);
      }
    } catch {
      // ignore route history parse errors
    }

    try {
      const rawPinnedRoutes = window.localStorage.getItem(PINNED_ROUTE_STORAGE_KEY);
      if (rawPinnedRoutes) {
        setPinnedRoutes(JSON.parse(rawPinnedRoutes) as Array<{ hash: string; label: string }>);
      }
    } catch {
      // ignore pinned route parse errors
    }

    applyWindowState();
    window.addEventListener('hashchange', applyWindowState);
    window.addEventListener('resize', applyWindowState);
    return () => {
      window.removeEventListener('hashchange', applyWindowState);
      window.removeEventListener('resize', applyWindowState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      if (isCommandPaletteOpen && event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedPaletteIndex((previous) =>
          paletteResults.length === 0 ? 0 : (previous + 1) % paletteResults.length
        );
        return;
      }

      if (isCommandPaletteOpen && event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedPaletteIndex((previous) =>
          paletteResults.length === 0
            ? 0
            : (previous - 1 + paletteResults.length) % paletteResults.length
        );
        return;
      }

      if (isCommandPaletteOpen && event.key === 'Enter') {
        if (paletteResults[selectedPaletteIndex]) {
          event.preventDefault();
          handleLaunchRoute(paletteResults[selectedPaletteIndex].hash);
        }
        return;
      }

      if (!isTypingTarget && event.key === '/') {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        setIsCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, paletteResults, selectedPaletteIndex]);

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      return;
    }

    setLauncherQuery('');
    setSelectedPaletteIndex(0);
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    setSelectedPaletteIndex(0);
  }, [launcherQuery]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentHash) {
      return;
    }

    const routeLabel = formatRouteLabel(currentHash, activeSection);
    setRecentRoutes((previous) => {
      const nextRoutes = [
        { hash: currentHash, label: routeLabel },
        ...previous.filter((item) => item.hash !== currentHash),
      ].slice(0, 6);

      try {
        window.localStorage.setItem(RECENT_ROUTE_STORAGE_KEY, JSON.stringify(nextRoutes));
      } catch {
        // ignore local storage failures
      }

      return nextRoutes;
    });
  }, [activeSection, currentHash]);

  const togglePinnedRoute = (hash: string, label?: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const resolvedLabel = label || formatRouteLabel(hash, activeSection);
    setPinnedRoutes((previous) => {
      const existing = previous.find((item) => item.hash === hash);
      const nextRoutes = existing
        ? previous.filter((item) => item.hash !== hash)
        : [{ hash, label: resolvedLabel }, ...previous].slice(0, 8);

      try {
        window.localStorage.setItem(PINNED_ROUTE_STORAGE_KEY, JSON.stringify(nextRoutes));
      } catch {
        // ignore local storage failures
      }

      return nextRoutes;
    });
  };

  const handleLaunchRoute = (hash: string) => {
    goToHash(hash);
    setIsCommandPaletteOpen(false);
    setLauncherQuery('');
  };

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
        '--cf-panel-soft': 'rgba(255,255,255,0.03)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: isCompactLayout ? '1fr' : '280px minmax(0, 1fr)',
        background: themePalette.pageBackground,
        color: 'var(--cf-text)',
        fontFamily: '"Trebuchet MS", "Avenir Next", "Segoe UI", sans-serif',
      }}
    >
      <aside
        style={{
          position: 'relative',
          zIndex: 1,
          borderRight: isCompactLayout ? 'none' : '1px solid var(--cf-border)',
          borderBottom: isCompactLayout ? '1px solid var(--cf-border)' : 'none',
          padding: '24px 16px 28px',
          background: themePalette.sidebarBackground,
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
          display: 'grid',
          alignContent: 'start',
          gap: 18,
        }}
      >
        <button
          type="button"
          onClick={() => onSectionChange('overview')}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'grid',
            gap: 10,
          }}
          aria-label="Open ClearFlow home"
        >
          <img
            src={clearFlowLogoDataUri}
            alt="ClearFlow"
            style={{ width: 190, maxWidth: '100%', display: 'block' }}
          />
          <span
            style={{
              width: 'fit-content',
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px solid var(--cf-border)',
              background: activeSection === 'overview' ? 'rgba(54, 215, 255, 0.12)' : 'rgba(255,255,255,0.03)',
              color: activeSection === 'overview' ? 'var(--cf-accent-soft)' : 'var(--cf-muted)',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 1.1,
            }}
          >
            Home Dashboard
          </span>
        </button>

        <div
          style={{
            padding: 14,
            borderRadius: 18,
            background: 'var(--cf-panel-soft)',
            border: '1px solid var(--cf-border)',
            boxShadow: 'var(--cf-shadow)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 1.6,
              color: 'var(--cf-accent-soft)',
            }}
          >
            Operator & Board
          </div>
          <div style={{ color: 'var(--cf-text)', fontWeight: 700 }}>
            {currentUser?.name || 'Operator profile'}
          </div>
          <div style={{ color: 'var(--cf-muted)', fontSize: 13, lineHeight: 1.55 }}>
            {currentUser?.email || 'No Google identity loaded yet'}
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--cf-muted)' }}>Active board</span>
            <select
              value={activeEntityId ?? ''}
              onChange={(event) => onActiveEntityChange(event.target.value || null)}
              style={{
                width: '100%',
                minHeight: 42,
                borderRadius: 12,
                border: '1px solid var(--cf-border)',
                background: 'rgba(10, 16, 28, 0.72)',
                color: 'var(--cf-text)',
                padding: '0 12px',
                outline: 'none',
              }}
            >
              <option value="">Collective workspace</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.displayName || entity.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.55 }}>
            {activeEntityWorkspace
              ? activeEntityWorkspace.sessionStatusLabel
              : 'Collective workspace view combines the connected entity boards.'}
          </div>
          {activeEntity ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { label: 'Entity Profile', hash: '#entities' },
                { label: 'COA / Accounts', hash: '#accounting:chartOfAccounts' },
                { label: 'Accounting', hash: '#accounting:dashboard' },
                { label: 'Documents', hash: '#documents' },
              ].map((route) => (
                <button
                  key={route.hash}
                  type="button"
                  onClick={() => handleLaunchRoute(route.hash)}
                  style={{
                    minHeight: 34,
                    borderRadius: 10,
                    border: '1px solid var(--cf-border)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--cf-text)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: 'left',
                    padding: '0 10px',
                  }}
                >
                  {route.label}
                </button>
              ))}
            </div>
          ) : null}
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
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  gridTemplateColumns: isCompactLayout
                    ? 'repeat(auto-fit, minmax(170px, 1fr))'
                    : '1fr',
                }}
              >
                {group.items.map((item) => {
                  const isActive = item.id === activeSection;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onSectionChange(item.id)}
                      title={item.hint}
                      style={{
                        textAlign: 'left',
                        padding: '13px 14px',
                        borderRadius: 16,
                        border: '1px solid',
                        borderColor: isActive ? 'var(--cf-border-strong)' : 'var(--cf-border)',
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(54, 215, 255, 0.18), rgba(88, 141, 255, 0.18))'
                          : 'var(--cf-panel-soft)',
                        color: 'var(--cf-text)',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        boxShadow: isActive ? '0 14px 28px rgba(7, 17, 31, 0.24)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
                      }}
                    >
                      <span>{item.label}</span>
                      <span
                        style={{
                          fontSize: 11,
                          color: isActive ? 'var(--cf-accent-soft)' : 'rgba(255,255,255,0.45)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        Go
                      </span>
                    </button>
                  );
                })}
              </div>
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
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 18,
            maxWidth: 1480,
          }}
        >
          <section
            style={{
              padding: '12px 14px',
              borderRadius: 18,
              border: '1px solid var(--cf-border)',
              background: 'rgba(8, 15, 28, 0.34)',
              boxShadow: 'var(--cf-shadow)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      borderRadius: 999,
                      background: 'rgba(54, 215, 255, 0.08)',
                      border: '1px solid rgba(126, 242, 255, 0.18)',
                      color: 'var(--cf-accent-soft)',
                      fontSize: 12,
                      fontWeight: 700,
                      width: 'fit-content',
                    }}
                  >
                    {activeItem.label}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--cf-border)',
                      color: 'var(--cf-muted)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {activeRouteLabel}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--cf-border)',
                      color: 'var(--cf-muted)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {activeEntity
                      ? `Board: ${activeEntity.displayName || activeEntity.name}`
                      : 'Board: Collective workspace'}
                  </div>
                  {currentHash ? (
                    <button
                      type="button"
                      onClick={() => togglePinnedRoute(currentHash, activeRouteLabel)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 12px',
                        borderRadius: 999,
                        background: isCurrentRoutePinned
                          ? 'rgba(54, 215, 255, 0.12)'
                          : 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--cf-border)',
                        color: isCurrentRoutePinned ? 'var(--cf-accent-soft)' : 'var(--cf-muted)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isCurrentRoutePinned ? '[pin]' : '[+]'}
                      {isCurrentRoutePinned ? 'Unpin This View' : 'Pin This View'}
                    </button>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  {isSectionSubroute ? (
                    <button
                      type="button"
                      onClick={() => goToHash(`#${activeSection}`)}
                      style={{
                        minHeight: 42,
                        padding: '0 14px',
                        borderRadius: 14,
                        border: '1px solid var(--cf-border)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--cf-text)',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Back to {activeItem.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsCommandPaletteOpen(true)}
                    style={{
                      minHeight: 42,
                      padding: '0 14px',
                      borderRadius: 14,
                      border: '1px solid var(--cf-border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--cf-text)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Quick Open
                  </button>
                  {quickActions.slice(0, 2).map((action) => (
                    <button
                      key={action.hash}
                      type="button"
                      onClick={() => handleLaunchRoute(action.hash)}
                      style={{
                        minHeight: 42,
                        padding: '0 14px',
                        borderRadius: 14,
                        border: '1px solid rgba(126, 242, 255, 0.18)',
                        background: 'rgba(54, 215, 255, 0.08)',
                        color: 'var(--cf-accent-soft)',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                  <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--cf-muted)', minWidth: 220 }}>
                    <span>Entity board</span>
                    <select
                      value={activeEntityId || ''}
                      onChange={(event) => onActiveEntityChange(event.target.value || null)}
                      style={{
                        minHeight: 40,
                        borderRadius: 12,
                        border: '1px solid var(--cf-border)',
                        background: 'rgba(10, 16, 28, 0.72)',
                        color: 'var(--cf-text)',
                        padding: '0 12px',
                        outline: 'none',
                      }}
                    >
                      <option value="">Collective workspace</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.displayName || entity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleLaunchRoute(nextGuidance.hash)}
                    title={nextGuidance.description}
                    style={{
                      minHeight: 40,
                      padding: '0 12px',
                      borderRadius: 12,
                      border: '1px solid var(--cf-border)',
                      background: 'rgba(54, 215, 255, 0.08)',
                      color: 'var(--cf-accent-soft)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {nextGuidance.label}
                  </button>
              </div>
              {showUtilityPanels ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  minWidth: 280,
                }}
              >
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cf-border)',
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.3, color: 'var(--cf-accent-soft)' }}>
                    Workspace posture
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    Theme: {workspaceSettings.themeMode.replaceAll('_', ' ')}
                  </div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 4, lineHeight: 1.55, fontSize: 13 }}>
                    Refresh now returns to this active desk instead of restarting the app flow.
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--cf-border)',
                        background: 'rgba(255,255,255,0.03)',
                        fontSize: 12,
                        color: 'var(--cf-muted)',
                        fontWeight: 700,
                      }}
                    >
                      {pinnedRoutes.length} pinned
                    </div>
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--cf-border)',
                        background: 'rgba(255,255,255,0.03)',
                        fontSize: 12,
                        color: 'var(--cf-muted)',
                        fontWeight: 700,
                      }}
                    >
                      {recentRoutes.length} recent
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cf-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                      marginBottom: 8,
                    }}
                  >
                    Resume Work
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {resumeRoutes.length === 0 ? (
                      <div style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.5 }}>
                        As you move between desks, your latest working routes will show up here for quick return.
                      </div>
                    ) : (
                      resumeRoutes.map((route) => (
                        <button
                          key={`resume-${route.hash}`}
                          type="button"
                          onClick={() => goToHash(route.hash)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: '1px solid var(--cf-border)',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--cf-text)',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 4,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{route.label}</span>
                          <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{route.hash}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cf-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                      marginBottom: 8,
                    }}
                  >
                    Quick Actions
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {quickActions.map((action) => (
                      <div
                        key={action.hash}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 8,
                          alignItems: 'stretch',
                        }}
                      >
                        <button
                          type="button"
                            onClick={() => handleLaunchRoute(action.hash)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: '1px solid var(--cf-border)',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--cf-text)',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 4,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{action.label}</span>
                          <span style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.45 }}>
                            {action.description}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePinnedRoute(action.hash, action.label)}
                          title={
                            pinnedRoutes.some((item) => item.hash === action.hash)
                              ? 'Remove pinned route'
                              : 'Pin this route'
                          }
                          style={{
                            minWidth: 42,
                            borderRadius: 14,
                            border: '1px solid var(--cf-border)',
                            background: pinnedRoutes.some((item) => item.hash === action.hash)
                              ? 'rgba(54, 215, 255, 0.12)'
                              : 'rgba(255,255,255,0.03)',
                            color: pinnedRoutes.some((item) => item.hash === action.hash)
                              ? 'var(--cf-accent-soft)'
                              : 'var(--cf-muted)',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {pinnedRoutes.some((item) => item.hash === action.hash) ? '★' : '☆'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cf-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                      marginBottom: 8,
                    }}
                  >
                    Workspace Launcher
                  </div>
                  <input
                    type="text"
                    value={launcherQuery}
                    onChange={(event) => setLauncherQuery(event.target.value)}
                    placeholder="Search desks, tools, and actions"
                    style={{
                      width: '100%',
                      minHeight: 42,
                      borderRadius: 12,
                      border: '1px solid var(--cf-border)',
                      background: 'rgba(10, 16, 28, 0.72)',
                      color: 'var(--cf-text)',
                      padding: '0 12px',
                      outline: 'none',
                      marginBottom: 10,
                    }}
                  />
                  <div style={{ display: 'grid', gap: 8 }}>
                    {filteredLauncherItems.map((item) => (
                      <div
                        key={`${item.category}-${item.hash}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 8,
                          alignItems: 'stretch',
                        }}
                      >
                        <button
                          type="button"
                            onClick={() => handleLaunchRoute(item.hash)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: '1px solid var(--cf-border)',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--cf-text)',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 4,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{item.label}</span>
                          <span style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.45 }}>
                            {item.category} | {item.description}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePinnedRoute(item.hash, item.label)}
                          title={
                            pinnedRoutes.some((route) => route.hash === item.hash)
                              ? 'Remove pinned route'
                              : 'Pin this route'
                          }
                          style={{
                            minWidth: 42,
                            borderRadius: 14,
                            border: '1px solid var(--cf-border)',
                            background: pinnedRoutes.some((route) => route.hash === item.hash)
                              ? 'rgba(54, 215, 255, 0.12)'
                              : 'rgba(255,255,255,0.03)',
                            color: pinnedRoutes.some((route) => route.hash === item.hash)
                              ? 'var(--cf-accent-soft)'
                              : 'var(--cf-muted)',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {pinnedRoutes.some((route) => route.hash === item.hash) ? '★' : '☆'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cf-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                      marginBottom: 8,
                    }}
                  >
                    Pinned Routes
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {pinnedRoutes.length === 0 ? (
                      <div style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.5 }}>
                        Pin desks and actions from quick actions or launcher search to keep your most-used paths here.
                      </div>
                    ) : (
                      pinnedRoutes.map((route) => (
                        <div
                          key={route.hash}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            gap: 8,
                            alignItems: 'stretch',
                          }}
                        >
                          <button
                            type="button"
                              onClick={() => handleLaunchRoute(route.hash)}
                            style={{
                              textAlign: 'left',
                              padding: '10px 12px',
                              borderRadius: 14,
                              border: '1px solid var(--cf-border)',
                              background:
                                route.hash === currentHash
                                  ? 'rgba(54, 215, 255, 0.1)'
                                  : 'rgba(255,255,255,0.03)',
                              color: 'var(--cf-text)',
                              cursor: 'pointer',
                              display: 'grid',
                              gap: 4,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{route.label}</span>
                            <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{route.hash}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePinnedRoute(route.hash, route.label)}
                            title="Remove pinned route"
                            style={{
                              minWidth: 42,
                              borderRadius: 14,
                              border: '1px solid var(--cf-border)',
                              background: 'rgba(54, 215, 255, 0.12)',
                              color: 'var(--cf-accent-soft)',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            ★
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--cf-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                      marginBottom: 8,
                    }}
                  >
                    Recent Routes
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {recentRoutes.length === 0 ? (
                      <div style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.5 }}>
                        Your most recent desks and actions will appear here as you move through the app.
                      </div>
                    ) : (
                      recentRoutes.map((route) => (
                        <button
                          key={route.hash}
                          type="button"
                            onClick={() => handleLaunchRoute(route.hash)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: '1px solid var(--cf-border)',
                            background:
                              route.hash === currentHash
                                ? 'rgba(54, 215, 255, 0.1)'
                                : 'rgba(255,255,255,0.03)',
                            color: 'var(--cf-text)',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 4,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{route.label}</span>
                          <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{route.hash}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
              ) : null}
            </div>
          </section>
          {attentionItems.length > 0 ? (
            <section
              style={{
                marginBottom: 18,
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1.3,
                  color: 'var(--cf-accent-soft)',
                }}
              >
                Needs Your Attention
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                {attentionItems.slice(0, 3).map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => handleLaunchRoute(item.hash)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 18,
                      border: '1px solid var(--cf-border)',
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--cf-text)',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 6,
                      boxShadow: 'var(--cf-shadow)',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{item.title}</span>
                    <span style={{ color: 'var(--cf-muted)', fontSize: 13, lineHeight: 1.55 }}>
                      {item.detail}
                    </span>
                    <span
                      style={{
                        justifySelf: 'start',
                        marginTop: 4,
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: 'rgba(54,215,255,0.14)',
                        color: 'var(--cf-accent)',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {attentionActionLabel(item.hash)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {children}
        </div>
      </main>
      {isCommandPaletteOpen ? (
        <div
          onClick={() => setIsCommandPaletteOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 8, 15, 0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 30,
            display: 'grid',
            placeItems: 'start center',
            padding: '10vh 20px 20px',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              borderRadius: 24,
              border: '1px solid var(--cf-border-strong)',
              background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(12,18,30,0.96))',
              boxShadow: '0 40px 100px rgba(0,0,0,0.45)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 18,
                borderBottom: '1px solid var(--cf-border)',
                display: 'grid',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>Quick Open</div>
                <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
                  Press <strong>Ctrl/Command + K</strong> or <strong>/</strong>
                </div>
              </div>
              <input
                type="text"
                autoFocus
                value={launcherQuery}
                onChange={(event) => setLauncherQuery(event.target.value)}
                placeholder="Search desks, packets, actions, and workspace flows"
                style={{
                  width: '100%',
                  minHeight: 50,
                  borderRadius: 14,
                  border: '1px solid var(--cf-border)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--cf-text)',
                  padding: '0 14px',
                  outline: 'none',
                  fontSize: 15,
                }}
              />
            </div>
            <div
              style={{
                maxHeight: '60vh',
                overflowY: 'auto',
                padding: 18,
                display: 'grid',
                gap: 10,
              }}
            >
              {currentHash ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                    }}
                  >
                    Current View
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLaunchRoute(currentHash)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 16,
                      border: '1px solid var(--cf-border)',
                      background: 'rgba(54, 215, 255, 0.08)',
                      color: 'var(--cf-text)',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{activeRouteLabel}</span>
                    <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{currentHash}</span>
                  </button>
                </div>
              ) : null}
              {palettePinnedRoutes.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                    }}
                  >
                    Pinned
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {palettePinnedRoutes.map((route) => {
                      const resultIndex = paletteResults.findIndex(
                        (item) => item.hash === route.hash
                      );

                      return (
                      <button
                        key={`palette-pinned-${route.hash}`}
                        type="button"
                        onClick={() => handleLaunchRoute(route.hash)}
                        style={{
                          textAlign: 'left',
                          padding: '12px 14px',
                          borderRadius: 16,
                          border:
                            selectedPaletteIndex === resultIndex
                              ? '1px solid var(--cf-border-strong)'
                              : '1px solid var(--cf-border)',
                          background:
                            selectedPaletteIndex === resultIndex
                              ? 'rgba(54, 215, 255, 0.1)'
                              : 'rgba(255,255,255,0.03)',
                          color: 'var(--cf-text)',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{route.label}</span>
                        <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{route.hash}</span>
                      </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {paletteRecentRoutes.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 1.3,
                      color: 'var(--cf-accent-soft)',
                    }}
                  >
                    Recent
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {paletteRecentRoutes.map((route) => {
                      const resultIndex = paletteResults.findIndex(
                        (item) => item.hash === route.hash
                      );

                      return (
                        <button
                          key={`palette-recent-${route.hash}`}
                          type="button"
                          onClick={() => handleLaunchRoute(route.hash)}
                          style={{
                            textAlign: 'left',
                            padding: '12px 14px',
                            borderRadius: 16,
                            border:
                              selectedPaletteIndex === resultIndex
                                ? '1px solid var(--cf-border-strong)'
                                : '1px solid var(--cf-border)',
                            background:
                              selectedPaletteIndex === resultIndex
                                ? 'rgba(54, 215, 255, 0.1)'
                                : 'rgba(255,255,255,0.03)',
                            color: 'var(--cf-text)',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 4,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{route.label}</span>
                          <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{route.hash}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
                <div style={{ display: 'grid', gap: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 1.3,
                    color: 'var(--cf-accent-soft)',
                  }}
                >
                  Results
                </div>
              <div style={{ display: 'grid', gap: 8 }}>
                  {filteredLauncherItems.map((item) => {
                    const resultIndex = paletteResults.findIndex(
                      (candidate) => candidate.hash === item.hash
                    );

                    return (
                    <button
                      key={`palette-${item.category}-${item.hash}`}
                      type="button"
                      onClick={() => handleLaunchRoute(item.hash)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 16,
                        border:
                          selectedPaletteIndex === resultIndex
                            ? '1px solid var(--cf-border-strong)'
                            : '1px solid var(--cf-border)',
                        background:
                          selectedPaletteIndex === resultIndex
                            ? 'rgba(54, 215, 255, 0.1)'
                            : 'rgba(255,255,255,0.03)',
                        color: 'var(--cf-text)',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{item.label}</span>
                      <span style={{ color: 'var(--cf-muted)', fontSize: 12 }}>
                        {item.category} | {item.description}
                      </span>
                    </button>
                    );
                  })}
                  {filteredLauncherItems.length === 0 ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 16,
                        border: '1px solid var(--cf-border)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--cf-muted)',
                        lineHeight: 1.6,
                      }}
                    >
                      No matches yet. Try searching for `payments`, `upload`, `entity`, or `compliance`.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '14px 18px',
                borderTop: '1px solid var(--cf-border)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 12,
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--cf-muted)',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
                <span>{paletteResults.length} quick-open routes</span>
                <span>{launcherResultCount} search results</span>
                <span>{routeMemoryCount} remembered routes</span>
              </div>
              <div style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
                <span>Arrow keys move</span>
                <span>Enter opens</span>
                <span>Esc closes</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



