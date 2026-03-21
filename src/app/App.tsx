import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { AppSection, CoreDataBundle, EntityRecord } from '../types/core';
import type { Entity } from '../types/app.models';
import { useAuth } from '../hooks/useAuth';
import { coreMockData } from '../data/mockData';
import AppShell from '../components/layout/AppShell';
import { setDocumentVaultScope } from '../services/documentVault.service';
import type { OnboardingPath } from '../components/onboarding-path-select/OnboardingPathSelect';

const OverviewPage = lazy(() => import('../components/pages/OverviewPage'));
const EntitiesPage = lazy(() => import('../components/pages/EntitiesPage'));
const LedgerPage = lazy(() => import('../components/pages/LedgerPage'));
const AccountingPage = lazy(() => import('../components/pages/AccountingPage'));
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
const Welcome = lazy(() =>
  import('../components/welcome/Welcome').then((module) => ({
    default: module.Welcome,
  }))
);

const DATA_STORAGE_KEY = 'clearflow-core-data';
const SECTION_STORAGE_KEY = 'clearflow-active-section-v2';
const DOCUMENT_HASH_PREFIX = '#documents:';

type EntryStage = 'welcome' | 'pathSelect' | 'membership';

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
    bankAccounts: [],
    reconciliations: [],
    accountingPeriods: [],
    journalEntries: [],
    settlements: [],
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
    bankAccounts: candidate.bankAccounts ?? coreMockData.bankAccounts,
    reconciliations: candidate.reconciliations ?? coreMockData.reconciliations,
    accountingPeriods: candidate.accountingPeriods ?? coreMockData.accountingPeriods,
    journalEntries: candidate.journalEntries ?? coreMockData.journalEntries,
    settlements: candidate.settlements ?? coreMockData.settlements,
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

  const normalized = hashValue.replace('#', '');
  return allowedSections.includes(normalized as AppSection) ? (normalized as AppSection) : null;
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

function LoadingShell({ title, subtitle }: { title: string; subtitle: string }) {
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

export default function App() {
  const auth = useAuth();
  const [entryStage, setEntryStage] = useState<EntryStage>('welcome');
  const [selectedOnboardingPath, setSelectedOnboardingPath] =
    useState<OnboardingPath>('business_entity');
  const [activeSection, setActiveSection] = useState<AppSection>('overview');
  const [data, setData] = useState<CoreDataBundle>(coreMockData);

  const currentUserId = auth.currentUser?.id ?? null;

  const mappedAuthEntities = useMemo(
    () => mapAuthEntitiesToCore(auth.appData?.entities ?? []),
    [auth.appData?.entities]
  );

  useEffect(() => {
    if (auth.authStatus === 'unauthenticated') {
      setEntryStage('welcome');
      setActiveSection('overview');
      setData(coreMockData);
      setDocumentVaultScope(null);
    }
  }, [auth.authStatus]);

  useEffect(() => {
    setDocumentVaultScope(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (auth.authStatus !== 'authenticated' || !currentUserId) {
      return;
    }

    const nextData = loadDataForUser(
      currentUserId,
      auth.appData?.entities ?? [],
      auth.appData?.coreDataSnapshot
    );

    setData(nextData);
    const hashSection =
      typeof window !== 'undefined' ? parseHashSection(window.location.hash) : null;
    setActiveSection(hashSection || loadSectionForUser(currentUserId));
  }, [auth.authStatus, auth.appData?.coreDataSnapshot, auth.appData?.entities, currentUserId]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextSection = parseHashSection(window.location.hash);
      if (nextSection) {
        setActiveSection(nextSection);
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
    auth.updateCoreDataSnapshot(data);
  }, [auth, auth.authStatus, currentUserId, data]);

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

  if (!auth.isInitialized) {
    return (
      <LoadingShell
        title="Preparing ClearFlow"
        subtitle="Loading secure sign-in, onboarding, and user workspace state."
      />
    );
  }

  if (auth.authStatus === 'unauthenticated') {
    if (entryStage === 'pathSelect') {
      return (
        <Suspense fallback={<SuspenseShell title="Loading Onboarding Paths" />}>
          <OnboardingPathSelect
            onBack={() => setEntryStage('welcome')}
            onSelectPath={(path) => {
              setSelectedOnboardingPath(path);
              setEntryStage('membership');
            }}
          />
        </Suspense>
      );
    }

    if (entryStage === 'membership') {
      return (
        <Suspense fallback={<SuspenseShell title="Loading Secure Intake" />}>
          <MembershipEstablishment
            selectedPath={selectedOnboardingPath}
            onBack={() => setEntryStage('pathSelect')}
            onContinueToLogin={() => setEntryStage('welcome')}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<SuspenseShell title="Loading Secure Access" />}>
        <Welcome
          isConfigured={auth.isConfigured}
          renderGoogleButton={auth.renderGoogleButton}
          onDevLogin={() => auth.mockLogin('ClearFlow Dev User', 'dev@clearflow.site')}
          onStartOnboarding={() => setEntryStage('pathSelect')}
          pendingCredentialAuth={auth.pendingCredentialAuth}
          onStartCredentialAuth={auth.startCredentialAuth}
          onVerifyCredentialAuth={auth.verifyCredentialAuth}
          onCancelCredentialAuth={auth.cancelCredentialAuth}
        />
      </Suspense>
    );
  }

  if (auth.authStatus === 'pending-gsi' || auth.authStatus === 'pending-drive-check') {
    return (
      <LoadingShell
        title="Connecting Secure Access"
        subtitle="Checking Google identity and loading the user workspace from secure storage."
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
      onSectionChange={setActiveSection}
      workspaceSettings={data.workspaceSettings}
    >
      <Suspense fallback={<SuspenseShell title="Loading Workspace" />}>
        {renderSection()}
      </Suspense>
    </AppShell>
  );
}
