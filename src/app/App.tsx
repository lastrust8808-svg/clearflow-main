import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSection, CoreDataBundle, EntityRecord } from '../types/core';
import type { Entity } from '../types/app.models';
import { useAuth } from '../hooks/useAuth';
import { coreMockData } from '../data/mockData';
import { PRIVACY_DOCUMENTS, TERMS_DOCUMENTS } from '../data/governance-docs';
import AppShell from '../components/layout/AppShell';
import PublicLegalPage from '../components/public/PublicLegalPage';
import { Welcome } from '../components/welcome/Welcome';
import { setDocumentVaultScope } from '../services/documentVault.service';
import { buildTransactionProofChainEnvelopes } from '../services/transactionProofChain.service';
import { saveTransactionProofChains } from '../services/transactionProofVault.service';
import {
  applyEntityMarkValueToBundle,
  findNextEntityMarkEligibleDocument,
} from '../services/entityMarkReserve.service';
import { scopeBundleToEntity } from '../services/entityBundleScope.service';
const OverviewPage = lazy(() => import('../components/pages/OverviewPage'));
const EntitiesPage = lazy(() => import('../components/pages/EntitiesPage'));
const AccountingPage = lazy(() => import('../components/pages/AccountingPage'));
const LedgerPage = lazy(() => import('../components/pages/LedgerPage'));
const AssetsPage = lazy(() => import('../components/pages/AssetsPage'));
const TransactionsPage = lazy(() => import('../components/pages/TransactionsPage'));
const CompliancePage = lazy(() => import('../components/pages/ComplianceWorkbenchPage'));
const DocumentsPage = lazy(() => import('../components/pages/DocumentsPage'));
const AIStudioPage = lazy(() => import('../components/pages/AIStudioPage'));
const SettingsPage = lazy(() => import('../components/pages/SettingsPage'));

const ProfileSetup = lazy(() =>
  import('../components/profile-setup/ProfileSetup').then((module) => ({
    default: module.ProfileSetup,
  }))
);
const Verification = lazy(() =>
  import('../components/verification/Verification').then((module) => ({
    default: module.Verification,
  }))
);

const DATA_STORAGE_KEY = 'clearflow-core-data';
const SECTION_STORAGE_KEY = 'clearflow-active-section-v2';
const ROUTE_STORAGE_KEY = 'clearflow-active-route-v1';
const ACTIVE_ENTITY_STORAGE_KEY = 'clearflow-active-entity-v1';
const DOCUMENT_HASH_PREFIX = '#documents:';
const ONBOARDING_INTENT_STORAGE_KEY = 'clearflow-onboarding-intent';
const ONBOARDING_STAGE_STORAGE_KEY = 'clearflow-onboarding-stage';

type WelcomeIntent = 'existing' | 'new';
type PostAuthOnboardingStage = 'membership' | 'profile';

interface AppProps {
  initialWelcomeView?: 'landing' | 'signin';
}

type PublicRoute = 'privacy' | 'terms' | null;

function resolvePublicRoute(): PublicRoute {
  if (typeof window === 'undefined') {
    return null;
  }

  if (window.location.pathname === '/privacy' || window.location.hash === '#privacy') {
    return 'privacy';
  }

  if (window.location.pathname === '/terms' || window.location.hash === '#terms') {
    return 'terms';
  }

  return null;
}

function loadStoredOnboardingIntent(): WelcomeIntent {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_INTENT_STORAGE_KEY);
    return raw === 'new' ? 'new' : 'existing';
  } catch {
    return 'existing';
  }
}

function setStoredOnboardingIntent(intent: WelcomeIntent) {
  try {
    window.localStorage.setItem(ONBOARDING_INTENT_STORAGE_KEY, intent);
  } catch {
    // ignore local storage errors
  }
}

function loadStoredOnboardingStage(): PostAuthOnboardingStage {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STAGE_STORAGE_KEY);
    if (raw === 'profile') {
      return raw;
    }
  } catch {
    // ignore local storage errors
  }

  return 'membership';
}

function setStoredOnboardingStage(stage: PostAuthOnboardingStage) {
  try {
    window.localStorage.setItem(ONBOARDING_STAGE_STORAGE_KEY, stage);
  } catch {
    // ignore local storage errors
  }
}

function clearStoredOnboardingFlow() {
  try {
    window.localStorage.removeItem(ONBOARDING_INTENT_STORAGE_KEY);
    window.localStorage.removeItem(ONBOARDING_STAGE_STORAGE_KEY);
  } catch {
    // ignore local storage errors
  }
}

const allowedSections: AppSection[] = [
  'overview',
  'accounting',
  'entities',
  'ledger',
  'assets',
  'transactions',
  'compliance',
  'documents',
  'aiStudio',
  'settings',
];

function buildScopedKey(base: string, userId: string) {
  return `${base}:${userId}`;
}

function loadActiveEntityForUser(userId: string): string | null {
  try {
    return window.localStorage.getItem(buildScopedKey(ACTIVE_ENTITY_STORAGE_KEY, userId));
  } catch {
    return null;
  }
}

function mapAuthEntityTypeToCore(type: Entity['type']): EntityRecord['type'] {
  switch (type) {
    case 'Trust/Estate':
      return 'trust';
    case 'LLC':
      return 'llc';
    case 'Non-profit':
      return 'nonprofit';
    case 'Personal':
      return 'individual';
    case 'C-Corp':
    case 'S-Corp':
      return 'corporation';
    default:
      return 'other';
  }
}

function mapCoreEntityTypeToAuth(type: EntityRecord['type']): Entity['type'] {
  switch (type) {
    case 'trust':
      return 'Trust/Estate';
    case 'llc':
      return 'LLC';
    case 'nonprofit':
      return 'Non-profit';
    case 'individual':
      return 'Personal';
    case 'corporation':
      return 'C-Corp';
    default:
      return 'LLC';
  }
}

function mapAuthEntitiesToCore(entities: Entity[] = []): EntityRecord[] {
  return entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    displayName: entity.name,
    type: mapAuthEntityTypeToCore(entity.type),
    taxId: entity.ein || undefined,
    status: entity.isVerified ? 'active' : 'draft',
    ownerDisplay: entity.bankSourcedOwnerNames?.join(', ') || undefined,
  }));
}

function mapCoreEntitiesToAuth(entities: EntityRecord[] = []): Entity[] {
  return entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: mapCoreEntityTypeToAuth(entity.type),
    ein: entity.taxId ?? '',
    bankConnected: false,
    isVerified: entity.status === 'active',
  }));
}

function buildBlankBundle(seedEntities: EntityRecord[]): CoreDataBundle {
  return {
    ...coreMockData,
    entities: seedEntities,
    entityMarkUsageRecords: [],
    entityConnections: [],
    creditRails: [],
    negotiableInstrumentRegisters: [],
    holderLedgerEntries: [],
    dispatchRecords: [],
    customers: [],
    vendors: [],
    invoices: [],
    bills: [],
    receipts: [],
    expenses: [],
    payments: [],
    employees: [],
    directDepositAuthorizations: [],
    bankAccounts: [],
    reconciliations: [],
    accountingPeriods: [],
    journalEntries: [],
    settlements: [],
    treasuryAccounts: [],
    instrumentSettlements: [],
    remittanceStatements: [],
    couponPresentments: [],
    movementIdentifiers: [],
    returnEvents: [],
    reclamationEvents: [],
    taxReportingLinks: [],
    ledgerAccounts: [],
    assets: [],
    wallets: [],
    digitalAssets: [],
    smartContractPositions: [],
    instruments: [],
    obligations: [],
    authorityRecords: [],
    onChainTransactions: [],
    transactions: [],
    interEntityTransfers: [],
    complianceTags: [],
    municipalDisclosures: [],
    municipalEventNotices: [],
    kybReviews: [],
    watchlistScreenings: [],
    amlCases: [],
    digitalAssetCompliance: [],
    documents: [],
    tokens: [],
    aiWorkflows: coreMockData.aiWorkflows,
    bankFeedRules: [],
    bankFeedEntries: [],
    workspaceSettings: coreMockData.workspaceSettings,
  };
}

function normalizeCoreDataBundle(raw: Partial<CoreDataBundle> | null | undefined): CoreDataBundle {
  const candidate = raw ?? {};

  return {
    ...coreMockData,
    ...candidate,
    entities: candidate.entities ?? coreMockData.entities,
    entityMarkUsageRecords: candidate.entityMarkUsageRecords ?? coreMockData.entityMarkUsageRecords,
    entityConnections: candidate.entityConnections ?? coreMockData.entityConnections,
    creditRails: candidate.creditRails ?? coreMockData.creditRails,
    negotiableInstrumentRegisters:
      candidate.negotiableInstrumentRegisters ?? coreMockData.negotiableInstrumentRegisters,
    holderLedgerEntries: candidate.holderLedgerEntries ?? coreMockData.holderLedgerEntries,
    dispatchRecords: candidate.dispatchRecords ?? coreMockData.dispatchRecords,
    customers: candidate.customers ?? coreMockData.customers,
    vendors: candidate.vendors ?? coreMockData.vendors,
    invoices: candidate.invoices ?? coreMockData.invoices,
    bills: candidate.bills ?? coreMockData.bills,
    receipts: candidate.receipts ?? coreMockData.receipts,
    expenses: candidate.expenses ?? coreMockData.expenses,
    payments: candidate.payments ?? coreMockData.payments,
    employees: candidate.employees ?? coreMockData.employees,
    directDepositAuthorizations:
      candidate.directDepositAuthorizations ?? coreMockData.directDepositAuthorizations,
    bankAccounts: candidate.bankAccounts ?? coreMockData.bankAccounts,
    reconciliations: candidate.reconciliations ?? coreMockData.reconciliations,
    accountingPeriods: candidate.accountingPeriods ?? coreMockData.accountingPeriods,
    journalEntries: candidate.journalEntries ?? coreMockData.journalEntries,
    settlements: candidate.settlements ?? coreMockData.settlements,
    treasuryAccounts: candidate.treasuryAccounts ?? coreMockData.treasuryAccounts,
    instrumentSettlements:
      candidate.instrumentSettlements ?? coreMockData.instrumentSettlements,
    remittanceStatements:
      candidate.remittanceStatements ?? coreMockData.remittanceStatements,
    couponPresentments:
      candidate.couponPresentments ?? coreMockData.couponPresentments,
    movementIdentifiers:
      candidate.movementIdentifiers ?? coreMockData.movementIdentifiers,
    returnEvents: candidate.returnEvents ?? coreMockData.returnEvents,
    reclamationEvents:
      candidate.reclamationEvents ?? coreMockData.reclamationEvents,
    taxReportingLinks:
      candidate.taxReportingLinks ?? coreMockData.taxReportingLinks,
    ledgerAccounts: candidate.ledgerAccounts ?? coreMockData.ledgerAccounts,
    assets: candidate.assets ?? coreMockData.assets,
    wallets: candidate.wallets ?? coreMockData.wallets,
    digitalAssets: candidate.digitalAssets ?? coreMockData.digitalAssets,
    smartContractPositions:
      candidate.smartContractPositions ?? coreMockData.smartContractPositions,
    instruments: candidate.instruments ?? coreMockData.instruments,
    obligations: candidate.obligations ?? coreMockData.obligations,
    authorityRecords: candidate.authorityRecords ?? coreMockData.authorityRecords,
    onChainTransactions: candidate.onChainTransactions ?? coreMockData.onChainTransactions,
    transactions: candidate.transactions ?? coreMockData.transactions,
    interEntityTransfers: candidate.interEntityTransfers ?? coreMockData.interEntityTransfers,
    complianceTags: candidate.complianceTags ?? coreMockData.complianceTags,
    municipalDisclosures:
      candidate.municipalDisclosures ?? coreMockData.municipalDisclosures,
    municipalEventNotices:
      candidate.municipalEventNotices ?? coreMockData.municipalEventNotices,
    kybReviews: candidate.kybReviews ?? coreMockData.kybReviews,
    watchlistScreenings:
      candidate.watchlistScreenings ?? coreMockData.watchlistScreenings,
    amlCases: candidate.amlCases ?? coreMockData.amlCases,
    digitalAssetCompliance:
      candidate.digitalAssetCompliance ?? coreMockData.digitalAssetCompliance,
    documents: candidate.documents ?? coreMockData.documents,
    tokens: candidate.tokens ?? coreMockData.tokens,
    aiWorkflows: candidate.aiWorkflows ?? coreMockData.aiWorkflows,
    bankFeedRules: candidate.bankFeedRules ?? coreMockData.bankFeedRules,
    bankFeedEntries: candidate.bankFeedEntries ?? coreMockData.bankFeedEntries,
    workspaceSettings: {
      ...coreMockData.workspaceSettings,
      ...(candidate.workspaceSettings ?? {}),
    },
  };
}

function loadSectionForUser(userId: string) {
  try {
    const raw = window.localStorage.getItem(buildScopedKey(SECTION_STORAGE_KEY, userId));
    if (raw && allowedSections.includes(raw as AppSection)) {
      return raw as AppSection;
    }
  } catch {
    // ignore local storage errors and use default
  }

  return 'overview' as AppSection;
}

function loadRouteForUser(userId: string) {
  try {
    const raw = window.localStorage.getItem(buildScopedKey(ROUTE_STORAGE_KEY, userId));
    if (!raw) {
      return '';
    }

    if (parseHashSection(raw)) {
      return raw;
    }

    if (allowedSections.includes(raw as AppSection)) {
      return buildSectionHash(raw as AppSection);
    }
  } catch {
    // ignore local storage errors and use default route
  }

  return '';
}

function parseHashSection(hashValue: string): AppSection | null {
  if (!hashValue) {
    return null;
  }

  if (hashValue.startsWith(DOCUMENT_HASH_PREFIX)) {
    return 'documents';
  }

  const normalized = hashValue.replace('#', '').split(':')[0];
  return allowedSections.includes(normalized as AppSection) ? (normalized as AppSection) : null;
}

function buildSectionHash(section: AppSection) {
  return `#${section}`;
}

function resolvePreferredRoute(hashValue: string, fallbackSection: AppSection) {
  return parseHashSection(hashValue) ? hashValue : buildSectionHash(fallbackSection);
}

function replaceWindowHash(hashValue: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextUrl = `${window.location.pathname}${window.location.search}${hashValue}`;
  window.history.replaceState(null, '', nextUrl);
}

function loadDataForUser(userId: string, authEntities: Entity[], coreDataSnapshot?: CoreDataBundle) {
  const scopedKey = buildScopedKey(DATA_STORAGE_KEY, userId);
  const mappedEntities = mapAuthEntitiesToCore(authEntities);

  if (coreDataSnapshot) {
    const parsed = normalizeCoreDataBundle(coreDataSnapshot);
    if (parsed.entities.length === 0 && mappedEntities.length > 0) {
      return { ...parsed, entities: mappedEntities };
    }
    return parsed;
  }

  try {
    const raw = window.localStorage.getItem(scopedKey);
    if (raw) {
      const parsed = normalizeCoreDataBundle(JSON.parse(raw) as Partial<CoreDataBundle>);
      if (parsed.entities.length === 0 && mappedEntities.length > 0) {
        return { ...parsed, entities: mappedEntities };
      }
      return parsed;
    }
  } catch {
    // fall through to auth-backed seed data
  }

  return buildBlankBundle(mappedEntities);
}

function LoadingShell({
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'linear-gradient(135deg, #120816 0%, #1b1026 45%, #0c1224 100%)',
        color: '#fff6fd',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 24,
          padding: 24,
          background: 'rgba(24, 18, 42, 0.88)',
          border: '1px solid rgba(126, 242, 255, 0.18)',
          boxShadow: '0 24px 80px rgba(9, 5, 17, 0.45)',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800 }}>{title}</div>
        <div style={{ marginTop: 10, color: '#c5d7e3', lineHeight: 1.6 }}>{subtitle}</div>
        {actionLabel && onAction ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <button
              type="button"
              onClick={onAction}
              style={{
                minHeight: 46,
                padding: '0 16px',
                borderRadius: 14,
                border: '1px solid rgba(126, 242, 255, 0.24)',
                background: 'rgba(54, 215, 255, 0.1)',
                color: '#effcff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {actionLabel}
            </button>
            {secondaryActionLabel && onSecondaryAction ? (
              <button
                type="button"
                onClick={onSecondaryAction}
                style={{
                  minHeight: 46,
                  padding: '0 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#effcff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SuspenseShell({ title }: { title: string }) {
  return (
    <LoadingShell
      title={title}
      subtitle="Loading the next ClearFlow workspace surface."
    />
  );
}

function WorkspaceSectionLoading({ title }: { title: string }) {
  return (
    <div
      style={{
        borderRadius: 22,
        border: '1px solid rgba(126, 242, 255, 0.16)',
        background: 'rgba(15,23,42,0.48)',
        padding: 24,
        color: '#e5eef7',
        display: 'grid',
        gap: 10,
        minHeight: 240,
        alignContent: 'center',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800 }}>{title}</div>
      <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
        Loading the next ClearFlow workspace without dropping the main shell.
      </div>
    </div>
  );
}

function openAccessRecoveryHelp() {
  if (typeof window === 'undefined') {
    return;
  }

  const subject = encodeURIComponent('ClearFlow Secure Access Recovery Help');
  const body = encodeURIComponent(
    [
      'Hello ClearFlow Support,',
      '',
      'I need help with Google sign-in or secure workspace access.',
      '',
      `Current origin: ${window.location.origin}`,
      `Current path: ${window.location.pathname}`,
      `Timestamp: ${new Date().toISOString()}`,
      '',
      'Requested support:',
      '- Google sign-in troubleshooting',
      '- Temporary access handoff',
      '- Login email change request',
      '',
      'Please follow up with the secure recovery steps.',
    ].join('\n')
  );

  window.location.href = `mailto:billing@clearflow.site?subject=${subject}&body=${body}`;
}

function preloadWorkspaceSection(section: AppSection) {
  switch (section) {
    case 'overview':
      void import('../components/pages/OverviewPage');
      break;
    case 'accounting':
      void import('../components/pages/AccountingPage');
      break;
    case 'entities':
      void import('../components/pages/EntitiesPage');
      break;
    case 'ledger':
      void import('../components/pages/LedgerPage');
      break;
    case 'assets':
      void import('../components/pages/AssetsPage');
      break;
    case 'transactions':
      void import('../components/pages/TransactionsPage');
      break;
    case 'compliance':
      void import('../components/pages/ComplianceWorkbenchPage');
      break;
    case 'documents':
      void import('../components/pages/DocumentsPage');
      break;
    case 'aiStudio':
      void import('../components/pages/AIStudioPage');
      break;
    case 'settings':
      void import('../components/pages/SettingsPage');
      break;
    default:
      break;
  }
}

export default function App({
  initialWelcomeView = 'landing',
}: AppProps) {
  const publicRoute = resolvePublicRoute();
  const auth = useAuth();
  const [welcomeIntent, setWelcomeIntent] = useState<WelcomeIntent>(() =>
    loadStoredOnboardingIntent()
  );
  const [postAuthOnboardingStage, setPostAuthOnboardingStage] =
    useState<PostAuthOnboardingStage>(() => loadStoredOnboardingStage());
  const [activeSection, setActiveSection] = useState<AppSection>('overview');
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [data, setData] = useState<CoreDataBundle>(coreMockData);
  const hydratedUserIdRef = useRef<string | null>(null);
  const initializedSectionUserIdRef = useRef<string | null>(null);
  const lastProofChainSignatureRef = useRef<string | null>(null);

  const currentUserId = auth.currentUser?.id ?? null;

  const mappedAuthEntities = useMemo(
    () => mapAuthEntitiesToCore(auth.appData?.entities ?? []),
    [auth.appData?.entities]
  );
  const dataSignature = useMemo(() => JSON.stringify(data), [data]);
  const scopedData = useMemo(
    () => (activeEntityId ? scopeBundleToEntity(data, activeEntityId) : data),
    [activeEntityId, data]
  );
  const authSnapshotSignature = useMemo(
    () => JSON.stringify(auth.appData?.coreDataSnapshot ?? null),
    [auth.appData?.coreDataSnapshot]
  );

  useEffect(() => {
    if (auth.authStatus === 'unauthenticated') {
      setActiveSection('overview');
      setActiveEntityId(null);
      setData(coreMockData);
      setDocumentVaultScope(null);
      hydratedUserIdRef.current = null;
      initializedSectionUserIdRef.current = null;
    }
  }, [auth.authStatus]);

  useEffect(() => {
    if (
      auth.authStatus === 'pending-verification' ||
      auth.authStatus === 'authenticated'
    ) {
      clearStoredOnboardingFlow();
      setWelcomeIntent('existing');
      setPostAuthOnboardingStage('profile');
    }
  }, [auth.authStatus]);

  useEffect(() => {
    if (auth.authStatus !== 'pending-profile-setup') {
      return;
    }

    if (welcomeIntent !== 'new') {
      setWelcomeIntent('new');
      setStoredOnboardingIntent('new');
    }

    if (postAuthOnboardingStage !== 'profile') {
      setPostAuthOnboardingStage('profile');
      setStoredOnboardingStage('profile');
    }
  }, [auth.authStatus, postAuthOnboardingStage, welcomeIntent]);

  useEffect(() => {
    setDocumentVaultScope(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    if (hydratedUserIdRef.current === currentUserId) {
      return;
    }

    const nextData = loadDataForUser(
      currentUserId,
      auth.appData?.entities ?? [],
      auth.appData?.coreDataSnapshot
    );
    hydratedUserIdRef.current = currentUserId;
    setData((previous) => {
      const previousSignature = JSON.stringify(previous);
      const nextSignature = JSON.stringify(nextData);
      return previousSignature === nextSignature ? previous : nextData;
    });
  }, [
    auth.authStatus,
    auth.appData?.coreDataSnapshot,
    auth.appData?.entities,
    currentUserId,
  ]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    if (initializedSectionUserIdRef.current === currentUserId) {
      return;
    }

    initializedSectionUserIdRef.current = currentUserId;
    const browserHash = typeof window !== 'undefined' ? window.location.hash : '';
    const hashSection = parseHashSection(browserHash);
    const storedRoute = loadRouteForUser(currentUserId);
    const storedSection = loadSectionForUser(currentUserId);
    const nextRoute = hashSection ? browserHash : resolvePreferredRoute(storedRoute, storedSection);
    const nextSection = parseHashSection(nextRoute) || storedSection;
    setActiveSection(nextSection);
    if (typeof window !== 'undefined' && window.location.hash !== nextRoute) {
      replaceWindowHash(nextRoute);
    }
  }, [auth.authStatus, currentUserId]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    const storedEntityId = loadActiveEntityForUser(currentUserId);
    const availableEntityIds = new Set(data.entities.map((entity) => entity.id));
    const nextEntityId = storedEntityId && availableEntityIds.has(storedEntityId)
      ? storedEntityId
      : null;

    setActiveEntityId((previous) => (previous === nextEntityId ? previous : nextEntityId));
  }, [auth.authStatus, currentUserId, data.entities]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextSection = parseHashSection(window.location.hash);
      if (nextSection) {
        setActiveSection((previous) => (previous === nextSection ? previous : nextSection));
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    window.localStorage.setItem(buildScopedKey(DATA_STORAGE_KEY, currentUserId), JSON.stringify(data));
    if (authSnapshotSignature !== dataSignature) {
      auth.updateCoreDataSnapshot(data);
    }
  }, [auth, auth.authStatus, authSnapshotSignature, currentUserId, data, dataSignature]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    window.localStorage.setItem(
      buildScopedKey(SECTION_STORAGE_KEY, currentUserId),
      activeSection
    );
    const hashValue = resolvePreferredRoute(window.location.hash, activeSection);
    window.localStorage.setItem(buildScopedKey(ROUTE_STORAGE_KEY, currentUserId), hashValue);
  }, [activeSection, auth.authStatus, currentUserId]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    if (activeEntityId && !data.entities.some((entity) => entity.id === activeEntityId)) {
      setActiveEntityId(null);
      return;
    }

    try {
      const storageKey = buildScopedKey(ACTIVE_ENTITY_STORAGE_KEY, currentUserId);
      if (activeEntityId) {
        window.localStorage.setItem(storageKey, activeEntityId);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore local storage failures
    }
  }, [activeEntityId, auth.authStatus, currentUserId, data.entities]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !auth.appData) {
      return;
    }

    const nextAuthEntities = mapCoreEntitiesToAuth(data.entities);
    const currentAuthEntities = auth.appData.entities ?? [];

    if (JSON.stringify(nextAuthEntities) !== JSON.stringify(currentAuthEntities)) {
      auth.updateEntities(nextAuthEntities);
    }
  }, [auth, auth.authStatus, auth.appData, data.entities]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || mappedAuthEntities.length === 0) {
      return;
    }

    if (data.entities.length === 0) {
      setData((prev) => ({ ...prev, entities: mappedAuthEntities }));
    }
  }, [auth.authStatus, data.entities.length, mappedAuthEntities]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated') {
      return;
    }

    const nextEligibleDocument = findNextEntityMarkEligibleDocument(data);
    if (!nextEligibleDocument) {
      return;
    }

    setData((prev) => applyEntityMarkValueToBundle(prev, nextEligibleDocument.id));
  }, [auth.authStatus, data]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId || data.transactions.length === 0) {
      return;
    }

    const proofSignature = JSON.stringify({
      transactions: data.transactions.map((item) => ({
        id: item.id,
        settlementId: item.linkedSettlementId,
        tokenIds: item.linkedTokenIds ?? [],
      })),
      settlements: data.settlements.map((item) => ({
        id: item.id,
        verificationStatus: item.verificationStatus,
        tokenizedProofId: item.tokenizedProofId,
        linkedTokenIds: item.linkedTokenIds ?? [],
      })),
      movementIdentifiers: data.movementIdentifiers.map((item) => ({
        id: item.id,
        linkedSettlementId: item.linkedSettlementId,
        linkedPaymentId: item.linkedPaymentId,
        status: item.status,
      })),
    });

    if (lastProofChainSignatureRef.current === proofSignature) {
      return;
    }

    lastProofChainSignatureRef.current = proofSignature;
    let cancelled = false;

    void buildTransactionProofChainEnvelopes(data)
      .then((chains) => {
        if (cancelled) {
          return;
        }

        return saveTransactionProofChains(currentUserId, chains);
      })
      .catch((error) => {
        console.warn('Failed to save encrypted transaction proof chains.', error);
        if (!cancelled) {
          lastProofChainSignatureRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    auth.authStatus,
    currentUserId,
    data.movementIdentifiers,
    data.settlements,
    data.transactions,
  ]);

  const handleSectionChange = (nextSection: AppSection) => {
    preloadWorkspaceSection(nextSection);
    setActiveSection((previous) => (previous === nextSection ? previous : nextSection));
    replaceWindowHash(buildSectionHash(nextSection));
  };

  useEffect(() => {
    preloadWorkspaceSection('ledger');
    preloadWorkspaceSection('documents');
  }, []);

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <OverviewPage
            data={data}
            currentUser={auth.currentUser}
            activeEntityId={activeEntityId}
            onSelectActiveEntity={setActiveEntityId}
            hasDriveAccess={auth.hasDriveAccess}
          />
        );
      case 'accounting':
        return <AccountingPage data={scopedData} setData={setData} />;
      case 'entities':
        return (
          <EntitiesPage
            data={data}
            setData={setData}
            currentUser={auth.currentUser}
            hasDriveAccess={auth.hasDriveAccess}
            activeEntityId={activeEntityId}
            onSetActiveEntity={setActiveEntityId}
          />
        );
      case 'ledger':
        return <LedgerPage data={scopedData} setData={setData} />;
      case 'assets':
        return <AssetsPage data={scopedData} setData={setData} />;
      case 'transactions':
        return <TransactionsPage data={scopedData} setData={setData} />;
      case 'compliance':
        return <CompliancePage data={scopedData} setData={setData} />;
      case 'documents':
        return <DocumentsPage data={scopedData} setData={setData} />;
      case 'aiStudio':
        return <AIStudioPage data={scopedData} setData={setData} />;
      case 'settings':
        return (
          <SettingsPage
            data={data}
            setData={setData}
            activeEntityId={activeEntityId}
          />
        );
      default:
        return (
          <OverviewPage
            data={data}
            currentUser={auth.currentUser}
            activeEntityId={activeEntityId}
            onSelectActiveEntity={setActiveEntityId}
            hasDriveAccess={auth.hasDriveAccess}
          />
        );
    }
  };

  if (!auth.isInitialized && auth.authStatus !== 'unauthenticated') {
    return (
      <LoadingShell
        title="Preparing ClearFlow"
        subtitle="Loading secure sign-in, onboarding, and user workspace state."
      />
    );
  }

  if (publicRoute === 'privacy') {
    return (
      <PublicLegalPage
        title="ClearFlow Privacy & Data Retention"
        description="Public privacy and retention materials for ClearFlow users, platform records, and protected financial workflow data."
        documents={PRIVACY_DOCUMENTS}
      />
    );
  }

  if (publicRoute === 'terms') {
    return (
      <PublicLegalPage
        title="ClearFlow Terms & Governing Documents"
        description="Public operating and foundational terms for ClearFlow, including organizational authority and platform governance posture."
        documents={TERMS_DOCUMENTS}
      />
    );
  }

  if (auth.authStatus === 'unauthenticated') {
    return (
        <Welcome
          initialView={initialWelcomeView}
          initialIntent={welcomeIntent}
          lastKnownGoogleUser={auth.lastKnownGoogleUser}
          startGoogleSignIn={auth.startGoogleSignIn}
          onDevLogin={() => auth.mockLogin('ClearFlow Dev User', 'dev@clearflow.site')}
          onStartNewMember={() => {
            setWelcomeIntent('new');
            setStoredOnboardingIntent('new');
            setPostAuthOnboardingStage('profile');
            setStoredOnboardingStage('profile');
          }}
        onStartExistingMember={() => {
          setWelcomeIntent('existing');
          setStoredOnboardingIntent('existing');
          setPostAuthOnboardingStage('profile');
          setStoredOnboardingStage('profile');
        }}
      />
    );
  }

    if (auth.authStatus === 'pending-gsi' || auth.authStatus === 'pending-drive-check') {
      return (
        <LoadingShell
          title="Connecting Secure Access"
          subtitle="Authorizing Google identity, requesting Drive access, and loading the user workspace in one flow."
          actionLabel={auth.appData?.user ? 'Continue Onboarding Now' : undefined}
          onAction={
            auth.appData?.user ? () => auth.continueGoogleOnboardingFallback() : undefined
        }
        secondaryActionLabel="Need Sign-In Help?"
        onSecondaryAction={openAccessRecoveryHelp}
      />
    );
  }

  if (auth.authStatus === 'pending-profile-setup') {
    return (
      <Suspense fallback={<SuspenseShell title="Loading Profile Setup" />}>
        <ProfileSetup />
      </Suspense>
    );
  }

  if (auth.authStatus === 'pending-verification') {
    return (
      <Suspense fallback={<SuspenseShell title="Loading Verification" />}>
        <Verification />
      </Suspense>
    );
  }

  if (auth.authStatus !== 'authenticated' || !auth.currentUser) {
    return (
      <LoadingShell
        title="Preparing Workspace"
        subtitle="Finishing account state before loading the operating shell."
      />
    );
  }

  return (
    <AppShell
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      workspaceSettings={data.workspaceSettings}
      currentUser={auth.currentUser}
      entities={data.entities}
      activeEntityId={activeEntityId}
      onActiveEntityChange={setActiveEntityId}
      hasDriveAccess={auth.hasDriveAccess}
    >
      <Suspense fallback={<WorkspaceSectionLoading title="Loading Workspace" />}>
        {renderSection()}
      </Suspense>
    </AppShell>
  );
}
