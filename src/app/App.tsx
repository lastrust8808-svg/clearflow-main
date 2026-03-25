import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSection, CoreDataBundle, EntityRecord } from '../types/core';
import type { Entity } from '../types/app.models';
import { useAuth } from '../hooks/useAuth';
import { coreMockData } from '../data/mockData';
import AppShell from '../components/layout/AppShell';
import { Welcome } from '../components/welcome/Welcome';
import { setDocumentVaultScope } from '../services/documentVault.service';
import { getStoredMembershipDraft } from '../services/membershipDraft.service';
import type { OnboardingPath } from '../components/onboarding-path-select/OnboardingPathSelect';
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

const MembershipEstablishment = lazy(() =>
  import('../components/membership-establishment/MembershipEstablishment').then((module) => ({
    default: module.MembershipEstablishment,
  }))
);
const OnboardingPathSelect = lazy(() =>
  import('../components/onboarding-path-select/OnboardingPathSelect').then((module) => ({
    default: module.OnboardingPathSelect,
  }))
);
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
const DOCUMENT_HASH_PREFIX = '#documents:';
const ONBOARDING_INTENT_STORAGE_KEY = 'clearflow-onboarding-intent';
const ONBOARDING_STAGE_STORAGE_KEY = 'clearflow-onboarding-stage';

type WelcomeIntent = 'existing' | 'new';
type PostAuthOnboardingStage = 'pathSelect' | 'membership' | 'profile';

interface AppProps {
  initialWelcomeView?: 'landing' | 'signin';
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
    if (raw === 'membership' || raw === 'profile') {
      return raw;
    }
  } catch {
    // ignore local storage errors
  }

  return 'pathSelect';
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
    digitalAssetCompliance:
      candidate.digitalAssetCompliance ?? coreMockData.digitalAssetCompliance,
    documents: candidate.documents ?? coreMockData.documents,
    tokens: candidate.tokens ?? coreMockData.tokens,
    aiWorkflows: candidate.aiWorkflows ?? coreMockData.aiWorkflows,
    bankFeedRules: candidate.bankFeedRules ?? coreMockData.bankFeedRules,
    bankFeedEntries: candidate.bankFeedEntries ?? coreMockData.bankFeedEntries,
    workspaceSettings: candidate.workspaceSettings ?? coreMockData.workspaceSettings,
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
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
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
          <button
            type="button"
            onClick={onAction}
            style={{
              marginTop: 18,
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
  const auth = useAuth();
  const [selectedOnboardingPath, setSelectedOnboardingPath] =
    useState<OnboardingPath>('business_entity');
  const [welcomeIntent, setWelcomeIntent] = useState<WelcomeIntent>(() =>
    loadStoredOnboardingIntent()
  );
  const [postAuthOnboardingStage, setPostAuthOnboardingStage] =
    useState<PostAuthOnboardingStage>(() => loadStoredOnboardingStage());
  const [activeSection, setActiveSection] = useState<AppSection>('overview');
  const [data, setData] = useState<CoreDataBundle>(coreMockData);
  const hydratedUserIdRef = useRef<string | null>(null);
  const initializedSectionUserIdRef = useRef<string | null>(null);

  const currentUserId = auth.currentUser?.id ?? null;

  const mappedAuthEntities = useMemo(
    () => mapAuthEntitiesToCore(auth.appData?.entities ?? []),
    [auth.appData?.entities]
  );
  const dataSignature = useMemo(() => JSON.stringify(data), [data]);
  const authSnapshotSignature = useMemo(
    () => JSON.stringify(auth.appData?.coreDataSnapshot ?? null),
    [auth.appData?.coreDataSnapshot]
  );

  useEffect(() => {
    if (auth.authStatus === 'unauthenticated') {
      setActiveSection('overview');
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

    const storedDraft = getStoredMembershipDraft();
    const hasEntitySeed = Boolean(
      auth.appData?.entities?.length || auth.appData?.coreDataSnapshot?.entities?.length
    );
    const needsStructuredOnboarding =
      !auth.currentUser?.clearflowTermsAcceptedAt && !hasEntitySeed;

    if (!needsStructuredOnboarding) {
      return;
    }

    if (storedDraft) {
      setSelectedOnboardingPath(storedDraft.selectedPath);
    }

    if (welcomeIntent !== 'new') {
      setWelcomeIntent('new');
      setStoredOnboardingIntent('new');
    }

    const nextStage: PostAuthOnboardingStage = storedDraft ? 'membership' : 'pathSelect';
    if (postAuthOnboardingStage !== nextStage) {
      setPostAuthOnboardingStage(nextStage);
      setStoredOnboardingStage(nextStage);
    }
  }, [
    auth.appData?.coreDataSnapshot?.entities?.length,
    auth.appData?.entities?.length,
    auth.authStatus,
    auth.currentUser?.clearflowTermsAcceptedAt,
    postAuthOnboardingStage,
    welcomeIntent,
  ]);

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
    const hashSection =
      typeof window !== 'undefined' ? parseHashSection(window.location.hash) : null;
    const nextSection = hashSection || loadSectionForUser(currentUserId);
    setActiveSection(nextSection);
    if (typeof window !== 'undefined' && !window.location.hash.startsWith(DOCUMENT_HASH_PREFIX)) {
      replaceWindowHash(buildSectionHash(nextSection));
    }
  }, [auth.authStatus, currentUserId]);

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
  }, [activeSection, auth.authStatus, currentUserId]);

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
        return <OverviewPage data={data} />;
      case 'accounting':
        return <AccountingPage data={data} setData={setData} />;
      case 'entities':
        return <EntitiesPage data={data} setData={setData} />;
      case 'ledger':
        return <LedgerPage data={data} setData={setData} />;
      case 'assets':
        return <AssetsPage data={data} setData={setData} />;
      case 'transactions':
        return <TransactionsPage data={data} setData={setData} />;
      case 'compliance':
        return <CompliancePage data={data} setData={setData} />;
      case 'documents':
        return <DocumentsPage data={data} setData={setData} />;
      case 'aiStudio':
        return <AIStudioPage data={data} setData={setData} />;
      case 'settings':
        return <SettingsPage data={data} setData={setData} />;
      default:
        return <OverviewPage data={data} />;
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

  if (auth.authStatus === 'unauthenticated') {
    return (
      <Welcome
        initialView={initialWelcomeView}
        initialIntent={welcomeIntent}
        isConfigured={auth.isConfigured}
        renderGoogleButton={auth.renderGoogleButton}
        onDevLogin={() => auth.mockLogin('ClearFlow Dev User', 'dev@clearflow.site')}
        onStartNewMember={() => {
          setWelcomeIntent('new');
          setStoredOnboardingIntent('new');
          setPostAuthOnboardingStage('pathSelect');
          setStoredOnboardingStage('pathSelect');
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
        subtitle="Checking Google identity and loading the user workspace from secure storage."
        actionLabel={auth.appData?.user ? 'Continue Onboarding Now' : undefined}
        onAction={
          auth.appData?.user ? () => auth.continueGoogleOnboardingFallback() : undefined
        }
      />
    );
  }

  if (auth.authStatus === 'pending-profile-setup') {
    if (welcomeIntent === 'new' && postAuthOnboardingStage === 'pathSelect') {
      return (
        <Suspense fallback={<SuspenseShell title="Loading Onboarding Paths" />}>
          <OnboardingPathSelect
            onBack={() => {
              auth.logout();
              setWelcomeIntent('new');
              setStoredOnboardingIntent('new');
              setPostAuthOnboardingStage('pathSelect');
              setStoredOnboardingStage('pathSelect');
            }}
            onSelectPath={(path) => {
              setSelectedOnboardingPath(path);
              setPostAuthOnboardingStage('membership');
              setStoredOnboardingStage('membership');
            }}
          />
        </Suspense>
      );
    }

    if (welcomeIntent === 'new' && postAuthOnboardingStage === 'membership') {
      return (
        <Suspense fallback={<SuspenseShell title="Loading Secure Intake" />}>
          <MembershipEstablishment
            selectedPath={selectedOnboardingPath}
            onBack={() => {
              setPostAuthOnboardingStage('pathSelect');
              setStoredOnboardingStage('pathSelect');
            }}
            onContinue={() => {
              setPostAuthOnboardingStage('profile');
              setStoredOnboardingStage('profile');
            }}
          />
        </Suspense>
      );
    }

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
    >
      <Suspense fallback={<WorkspaceSectionLoading title="Loading Workspace" />}>
        {renderSection()}
      </Suspense>
    </AppShell>
  );
}
