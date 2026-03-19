import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  Entity,
  PlaidConnectionPayload,
  JournalEntry,
  Account,
  Payment,
  PlaidSignalResponse,
  IdentityVerificationStatus,
  PaymentRail,
} from '../types/app.models';
import { ConfirmationModal } from '../components/confirmation-modal/ConfirmationModal';
import { EntityDetail } from '../components/entity-analysis/EntityDetail';
import { Logo } from '../components/logo/Logo';
import { PlaidLinkModal } from '../components/plaid-link-modal/PlaidLinkModal';
import { ProfileSetup } from '../components/profile-setup/ProfileSetup';
import { geminiService } from '../services/gemini.service';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { Dashboard } from '../components/dashboard/Dashboard';
import { ReservesDashboard } from '../components/reserves-dashboard/ReservesDashboard';
import { Welcome } from '../components/welcome/Welcome';
import { EntryGateway } from '../components/entry-gateway/EntryGateway';
import { OnboardingPathSelect, type OnboardingPath } from '../components/onboarding-path-select/OnboardingPathSelect';
import { MembershipEstablishment, clearStoredMembershipDraft } from '../components/membership-establishment/MembershipEstablishment';
import { Verification } from '../components/verification/Verification';
import { AccountingDashboard } from '../components/accounting-dashboard/AccountingDashboard';
import { QuickAddModal } from '../components/quick-add-modal/QuickAddModal';
import { PaymentsDashboard } from '../components/payments-dashboard/PaymentsDashboard';
import { NewPaymentModal } from '../components/new-payment-modal/NewPaymentModal';
import { InternalTransferModal } from '../components/internal-transfer-modal/InternalTransferModal';
import { plaidService } from '../services/plaid.service';
import { FundingRails } from '../components/funding-rails/FundingRails';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/storage';
import OIDDebtInstrumentModule from '../components/oid-debt-instrument/OIDDebtInstrumentModule';
import {
  getOnboardingDraft,
  type MembershipIntakeDraft,
} from '../services/onboarding.service';

type View =
  | 'home'
  | 'accounting'
  | 'payments'
  | 'reserves'
  | 'entity'
  | 'addEntity'
  | 'fundingRails'
  | 'oidDebtInstrument';

type PublicView = 'entry' | 'pathSelect' | 'intake' | 'login';

const DRAFT_STORAGE_KEY = 'clearflow-membership-intake-draft';
const DRAFT_ID_STORAGE_KEY = 'clearflow-membership-intake-draft-id';

const loadStoredDraft = (): MembershipIntakeDraft | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MembershipIntakeDraft;
  } catch {
    return null;
  }
};

export const App: React.FC = () => {
  const auth = useAuth();

  const [currentView, setCurrentView] = useState<View>('home');
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [publicView, setPublicView] = useState<PublicView>('entry');
  const [selectedOnboardingPath, setSelectedOnboardingPath] = useState<OnboardingPath | null>(null);
  const [membershipIntakeDraft, setMembershipIntakeDraft] = useState<MembershipIntakeDraft | null>(null);
  const [hasAppliedIntakeDraft, setHasAppliedIntakeDraft] = useState(false);

  const entities = auth.appData?.entities ?? [];
  const selectedEntity = entities.find((e) => e.id === activeEntityId) ?? null;

  const [isPlaidModalVisible, setIsPlaidModalVisible] = useState(false);
  const [isTermsModalVisible, setIsTermsModalVisible] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [isQuickAddModalVisible, setIsQuickAddModalVisible] = useState(false);
  const [isNewPaymentModalVisible, setIsNewPaymentModalVisible] = useState(false);
  const [isInternalTransferModalVisible, setIsInternalTransferModalVisible] = useState(false);

  const [addEntityForm, setAddEntityForm] = useState({
    entityName: '',
    entityType: 'LLC',
    ein: '',
  });
  const [einError, setEinError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [retrievedPlaidPayload, setRetrievedPlaidPayload] = useState<PlaidConnectionPayload | null>(null);

  const [isVerifyingDoc, setIsVerifyingDoc] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verified' | 'failed'>('idle');
  const [verificationMessage, setVerificationMessage] = useState('');

  const [entityToDelete, setEntityToDelete] = useState<Entity | null>(null);

  const [skin, setSkin] = useState(() => safeLocalStorageGet('app-skin', 'dark'));

  useEffect(() => {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(skin);
  }, [skin]);

  useEffect(() => {
    const storedDraft = loadStoredDraft();
    if (storedDraft) {
      setMembershipIntakeDraft(storedDraft);
      setSelectedOnboardingPath(storedDraft.selectedPath);
    }
  }, []);

  useEffect(() => {
    const existingDraftId = localStorage.getItem(DRAFT_ID_STORAGE_KEY);
    if (!existingDraftId) return;

    getOnboardingDraft(existingDraftId)
      .then((response) => {
        if (response?.success && response.draft) {
          const restored: MembershipIntakeDraft = {
            selectedPath: response.draft.selectedPath,
            legalName: response.draft.legalName || '',
            displayName: response.draft.displayName || '',
            ein: response.draft.ein || '',
            representativeName: response.draft.representativeName || '',
            representativeEmail: response.draft.representativeEmail || '',
            representativePhone: response.draft.representativePhone || '',
            representativeRole: response.draft.representativeRole || '',
            stateOfFormation: response.draft.stateOfFormation || '',
            country: response.draft.country || 'United States',
            authorizedRepresentative: false,
            googleIdentityMatch: false,
            trustType: '',
            exemptClassification: '',
            acceptsDonations: false,
            acceptsAssignedAssets: false,
            notes: response.draft.notes || '',
          };

          setMembershipIntakeDraft(restored);
          setSelectedOnboardingPath(restored.selectedPath);
          localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(restored));
        }
      })
      .catch(() => {
        // keep local fallback
      });
  }, []);

  const toggleSkin = () => {
    const newSkin = skin === 'light' ? 'dark' : 'light';
    setSkin(newSkin);
    safeLocalStorageSet('app-skin', newSkin);
  };

  useEffect(() => {
    if (auth.authStatus === 'unauthenticated' && auth.isInitialized && auth.isConfigured) {
      const timer = setTimeout(() => {
        const container = document.getElementById('google-btn-container');
        if (container && !container.hasChildNodes()) {
          auth.renderGoogleButton('google-btn-container');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [auth.authStatus, auth.isInitialized, auth.isConfigured, auth.renderGoogleButton]);

  const handleDevLogin = () => {
    auth.mockLogin('Dev User', 'dev@example.com');
  };

  const mapOnboardingPathToEntityType = (
    path: OnboardingPath | null
  ): 'LLC' | 'C-Corp' | 'S-Corp' | 'Trust/Estate' | 'Non-profit' | 'Personal' => {
    switch (path) {
      case 'trust_estate':
        return 'Trust/Estate';
      case 'tax_exempt':
        return 'Non-profit';
      case 'personal':
        return 'Personal';
      case 'business_entity':
        return 'LLC';
      case 'private_membership':
        return 'LLC';
      case 'other_custom':
      default:
        return 'LLC';
    }
  };

  useEffect(() => {
    if (
      auth.authStatus === 'authenticated' &&
      membershipIntakeDraft &&
      !hasAppliedIntakeDraft
    ) {
      const mappedEntityType = mapOnboardingPathToEntityType(membershipIntakeDraft.selectedPath);

      setAddEntityForm({
        entityName: membershipIntakeDraft.legalName || membershipIntakeDraft.displayName || '',
        entityType: mappedEntityType,
        ein: membershipIntakeDraft.ein || '',
      });

      setAgreedToTerms(true);
      setEinError('');
      setVerificationFile(null);
      setVerificationStatus('idle');
      setVerificationMessage('');
      setBankConnected(false);
      setRetrievedPlaidPayload(null);
      setCurrentView('addEntity');
      setHasAppliedIntakeDraft(true);
    }
  }, [auth.authStatus, membershipIntakeDraft, hasAppliedIntakeDraft]);

  const showAddEntityForm = () => {
    setMembershipIntakeDraft(null);
    setSelectedOnboardingPath(null);
    setHasAppliedIntakeDraft(false);
    clearStoredMembershipDraft();
    localStorage.removeItem(DRAFT_ID_STORAGE_KEY);

    setAddEntityForm({ entityName: '', entityType: 'LLC', ein: '' });
    setBankConnected(false);
    setRetrievedPlaidPayload(null);
    setVerificationFile(null);
    setVerificationStatus('idle');
    setVerificationMessage('');
    setEinError('');
    setAgreedToTerms(false);
    setCurrentView('addEntity');
  };

  const handleViewChange = (view: View, entityId?: string) => {
    setCurrentView(view);
    if (entityId) {
      setActiveEntityId(entityId);
    } else if (view !== 'entity') {
      setActiveEntityId(null);
    }
  };

  const backToDashboard = () => {
    setCurrentView('home');
    setActiveEntityId(null);
  };

  const handleBankConnected = (data: PlaidConnectionPayload) => {
    setBankConnected(true);
    setRetrievedPlaidPayload(data);
    setIsPlaidModalVisible(false);
  };

  const onVerificationFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setVerificationFile(event.target.files[0]);
      setVerificationStatus('idle');
      setVerificationMessage('');
    }
  };

  const handleVerifyDocument = async () => {
    if (!verificationFile) return;

    setIsVerifyingDoc(true);
    setVerificationStatus('idle');
    setVerificationMessage('');

    try {
      if (!geminiService.isConfigured) {
        await new Promise((r) => setTimeout(r, 1500));
        setVerificationStatus('verified');
        setVerificationMessage('Dev Mode: Entity Verified (Mock).');
        setIsVerifyingDoc(false);
        return;
      }

      const result = await geminiService.analyzeDocument(verificationFile);
      const formEin = addEntityForm.ein.replace(/\D/g, '');
      const docEin = (result.ein || '').replace(/\D/g, '');
      const nameMatch = (result.entityName || '')
        .toLowerCase()
        .includes(addEntityForm.entityName.toLowerCase());

      if ((docEin && formEin && docEin === formEin) || nameMatch) {
        setVerificationStatus('verified');
        setVerificationMessage('Document verified successfully. EIN/Name matches.');
      } else if (!docEin) {
        setVerificationStatus('failed');
        setVerificationMessage('Could not detect EIN in document. Please ensure it is clearly visible.');
      } else {
        setVerificationStatus('failed');
        setVerificationMessage(`Mismatch detected. Form EIN: ${addEntityForm.ein}, Doc EIN: ${result.ein || 'N/A'}`);
      }
    } catch (e) {
      setVerificationStatus('failed');
      setVerificationMessage(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setIsVerifyingDoc(false);
    }
  };

  const handleEinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAddEntityForm((f) => ({ ...f, ein: value }));

    if (value && !/^\d{2}-\d{7}$/.test(value)) {
      setEinError('Invalid format. Please use XX-XXXXXXX.');
    } else {
      setEinError('');
    }
  };

  const handleEntityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setAddEntityForm((f) => ({ ...f, entityType: newType as any }));
    if (newType === 'Personal') {
      setAddEntityForm((f) => ({ ...f, ein: '' }));
      setEinError('');
      setVerificationFile(null);
      setVerificationStatus('idle');
    }
  };

  const isBusinessEntity = addEntityForm.entityType !== 'Personal';

  const isAddEntityFormValid =
    !!addEntityForm.entityName &&
    agreedToTerms &&
    (!isBusinessEntity || !!(addEntityForm.ein && !einError));

  const saveEntity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddEntityFormValid) return;

    let identityStatus: IdentityVerificationStatus = 'unverified';
    let bankVerificationStatus: string | undefined = undefined;
    let bankSourcedOwnerNames: string[] | undefined = undefined;
    let accountNumbers = undefined;
    let itemId = undefined;

    if (retrievedPlaidPayload) {
      const {
        authResponse,
        identityData,
        identityMatchScores,
        itemId: plaidItemId,
      } = retrievedPlaidPayload;

      const score = identityMatchScores.legal_name.score;
      if (score !== null) {
        if (score >= 85) identityStatus = 'verified';
        else if (score >= 70) identityStatus = 'pending_document';
        else identityStatus = 'failed';
      }

      bankVerificationStatus = authResponse.accounts[0]?.verification_status;
      bankSourcedOwnerNames = identityData.accounts[0]?.owners[0]?.names;
      accountNumbers = authResponse.numbers;
      itemId = plaidItemId;
    }

    const newEntity: Entity = {
      id: crypto.randomUUID(),
      name: addEntityForm.entityName,
      type: addEntityForm.entityType as any,
      ein: isBusinessEntity ? addEntityForm.ein : '',
      bankConnected,
      isVerified: isBusinessEntity ? verificationStatus === 'verified' : false,
      bankVerificationStatus,
      identityVerificationStatus: identityStatus,
      bankSourcedOwnerNames,
      reserveStatus: 'locked',
      journal: [],
      chartOfAccounts: [],
      reserves: [],
      invoices: [],
      bills: [],
      loans: [],
      payments: [],
      accountNumbers,
      itemId,
      transactions: [],
    };

    auth.updateEntities([...entities, newEntity]);
    setMembershipIntakeDraft(null);
    setSelectedOnboardingPath(null);
    setHasAppliedIntakeDraft(false);
    clearStoredMembershipDraft();
    localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
    setCurrentView('home');
    setActiveEntityId(null);
  };

  const promptDeleteEntity = (entity: Entity) => {
    setEntityToDelete(entity);
    setIsDeleteModalVisible(true);
  };

  const confirmDelete = () => {
    if (entityToDelete) {
      auth.updateEntities(entities.filter((e) => e.id !== entityToDelete.id));
    }
    setEntityToDelete(null);
    setIsDeleteModalVisible(false);
  };

  const handleEntityUpdate = (updatedEntity: Entity) => {
    const updatedEntities = entities.map((e) => (e.id === updatedEntity.id ? updatedEntity : e));
    auth.updateEntities(updatedEntities);
  };

  const handleRefreshAuth = async (entityId: string) => {
    const entityToUpdate = entities.find((e) => e.id === entityId);
    if (!entityToUpdate || !entityToUpdate.itemId) return;

    const authResponse = await plaidService.getAuth(entityToUpdate.itemId);

    const updatedEntity: Entity = {
      ...entityToUpdate,
      accountNumbers: authResponse.numbers,
      bankVerificationStatus: authResponse.accounts[0].verification_status,
    };
    handleEntityUpdate(updatedEntity);
  };

  const handleRefreshIdentity = async (entityId: string) => {
    const entityToUpdate = entities.find((e) => e.id === entityId);
    if (!entityToUpdate || !auth.currentUser || !entityToUpdate.itemId) return;

    const identityData = await plaidService.getIdentity(entityToUpdate.itemId, auth.currentUser.name);
    const newBankOwnerName = identityData.accounts[0]?.owners[0]?.names[0] || '';
    const matchScores = await plaidService.matchIdentity(auth.currentUser.name, newBankOwnerName);

    let newIdentityStatus: IdentityVerificationStatus = 'unverified';
    const score = matchScores.legal_name.score;
    if (score !== null) {
      if (score >= 85) newIdentityStatus = 'verified';
      else if (score >= 70) newIdentityStatus = 'pending_document';
      else newIdentityStatus = 'failed';
    }

    const updatedEntity: Entity = {
      ...entityToUpdate,
      bankSourcedOwnerNames: identityData.accounts[0]?.owners[0]?.names,
      identityVerificationStatus: newIdentityStatus,
    };
    handleEntityUpdate(updatedEntity);
  };

  const getEntityNetWorth = (entity: Entity): number => {
    const accounts = entity.chartOfAccounts ?? [];

    return accounts.reduce((total, account) => {
      const balance = Number(account.balance ?? 0);
      const type = String(account.type ?? '').toLowerCase();

      if (type === 'asset') return total + balance;
      if (type === 'liability') return total - balance;
      return total;
    }, 0);
  };

  const getPortfolioNetWorth = (): number => {
    return entities.reduce((sum, entity) => sum + getEntityNetWorth(entity), 0);
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const getAccountType = (accountName: string): Account['type'] => {
    const name = accountName.toLowerCase();
    if (name.includes('cash') || name.includes('receivable') || name.includes('asset') || name.includes('bank')) return 'Asset';
    if (name.includes('payable') || name.includes('loan') || name.includes('debt')) return 'Liability';
    if (name.includes('equity') || name.includes('capital')) return 'Equity';
    if (name.includes('revenue') || name.includes('income') || name.includes('sales')) return 'Revenue';
    return 'Expense';
  };

  const handlePostJournalEntry = (entityId: string, newEntry: JournalEntry) => {
    const entityToUpdate = entities.find((e) => e.id === entityId);
    if (!entityToUpdate) return;

    const currentAccounts = new Set((entityToUpdate.chartOfAccounts ?? []).map((a) => a.name));
    const newAccounts = newEntry.lines
      .filter((line) => !currentAccounts.has(line.account))
      .map((line) => ({ name: line.account, type: getAccountType(line.account), balance: 0 }));

    const updatedEntity: Entity = {
      ...entityToUpdate,
      journal: [...(entityToUpdate.journal ?? []), newEntry],
      chartOfAccounts: [...(entityToUpdate.chartOfAccounts ?? []), ...newAccounts],
    };

    handleEntityUpdate(updatedEntity);
    setIsQuickAddModalVisible(false);
  };

  const handleInitiatePayment = (paymentData: {
    entityId: string;
    amount: number;
    recipientName: string;
    memo?: string;
    signalResponse: PlaidSignalResponse;
    rail: PaymentRail;
  }) => {
    const { entityId, amount, recipientName, memo, signalResponse, rail } = paymentData;
    const entityToUpdate = entities.find((e) => e.id === entityId);
    if (!entityToUpdate) return;

    const newPayment: Payment = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      partyName: recipientName,
      amount,
      status: 'pending',
      rail,
      type: 'external',
      direction: 'outgoing',
      signalDecision: signalResponse.decision,
      memo,
    };

    const updatedEntity: Entity = {
      ...entityToUpdate,
      payments: [...(entityToUpdate.payments ?? []), newPayment],
    };

    handleEntityUpdate(updatedEntity);
    setIsNewPaymentModalVisible(false);

    const settlementDelay = rail === 'ACH' ? 6000 : 2000;
    setTimeout(() => {
      const entity = auth.appData?.entities.find((e) => e.id === entityId);
      if (!entity) return;

      const paymentToSettle = entity.payments?.find((p) => p.id === newPayment.id);
      if (!paymentToSettle) return;

      const isReturned = rail === 'ACH' && Math.random() < 0.1;
      const finalStatus = isReturned ? 'returned' : 'settled';

      const settledPayment: Payment = {
        ...paymentToSettle,
        status: finalStatus,
        settlementDate: new Date().toISOString().split('T')[0],
      };

      const journalEntry: JournalEntry = {
        id: crypto.randomUUID(),
        date: settledPayment.settlementDate!,
        description: `${isReturned ? 'RETURNED: ' : ''}Payment to ${recipientName}${memo ? ` - ${memo}` : ''} via ${rail}`,
        lines: isReturned
          ? [
              { account: 'Cash', debit: amount, credit: 0 },
              { account: 'Returned Payment Expense', debit: 0, credit: amount },
            ]
          : [
              { account: 'Operating Expenses', debit: amount, credit: 0 },
              { account: 'Cash', debit: 0, credit: amount },
            ],
      };

      const currentAccounts = new Set((entity.chartOfAccounts ?? []).map((a) => a.name));
      const newAccounts = journalEntry.lines
        .filter((line) => !currentAccounts.has(line.account))
        .map((line) => ({ name: line.account, type: getAccountType(line.account), balance: 0 }));

      const finalEntity: Entity = {
        ...entity,
        payments: (entity.payments ?? []).map((p) => (p.id === settledPayment.id ? settledPayment : p)),
        journal: [...(entity.journal ?? []), journalEntry],
        chartOfAccounts: [...(entity.chartOfAccounts ?? []), ...newAccounts],
      };
      handleEntityUpdate(finalEntity);
    }, settlementDelay);
  };

  const handleInitiateInternalTransfer = (data: {
    fromEntityId: string;
    toEntityId: string;
    amount: number;
    memo?: string;
  }) => {
    const { fromEntityId, toEntityId, amount, memo } = data;
    const fromEntity = entities.find((e) => e.id === fromEntityId);
    const toEntity = entities.find((e) => e.id === toEntityId);

    if (!fromEntity || !toEntity) return;

    const date = new Date().toISOString().split('T')[0];
    const description = `Internal transfer to ${toEntity.name}${memo ? ` - ${memo}` : ''}`;

    const outgoingPayment: Payment = {
      id: crypto.randomUUID(),
      date,
      settlementDate: date,
      rail: 'Internal',
      partyName: toEntity.name,
      amount,
      status: 'settled',
      type: 'internal',
      direction: 'outgoing',
      signalDecision: 'N/A',
      memo,
    };

    const fromJournalEntry: JournalEntry = {
      id: crypto.randomUUID(),
      date,
      description,
      lines: [
        { account: `Due From ${toEntity.name}`, debit: amount, credit: 0 },
        { account: 'Cash', debit: 0, credit: amount },
      ],
    };

    const fromAccounts = new Set((fromEntity.chartOfAccounts ?? []).map((a) => a.name));
    const newFromAccounts = fromJournalEntry.lines
      .filter((line) => !fromAccounts.has(line.account))
      .map((line) => ({ name: line.account, type: getAccountType(line.account), balance: 0 }));

    const updatedFromEntity: Entity = {
      ...fromEntity,
      payments: [...(fromEntity.payments || []), outgoingPayment],
      journal: [...(fromEntity.journal || []), fromJournalEntry],
      chartOfAccounts: [...(fromEntity.chartOfAccounts || []), ...newFromAccounts],
    };

    const incomingPayment: Payment = {
      id: crypto.randomUUID(),
      date,
      settlementDate: date,
      rail: 'Internal',
      partyName: fromEntity.name,
      amount,
      status: 'settled',
      type: 'internal',
      direction: 'incoming',
      signalDecision: 'N/A',
      memo,
    };

    const toJournalEntry: JournalEntry = {
      id: crypto.randomUUID(),
      date,
      description: `Internal transfer from ${fromEntity.name}${memo ? ` - ${memo}` : ''}`,
      lines: [
        { account: 'Cash', debit: amount, credit: 0 },
        { account: `Due To ${fromEntity.name}`, debit: 0, credit: amount },
      ],
    };

    const toAccounts = new Set((toEntity.chartOfAccounts ?? []).map((a) => a.name));
    const newToAccounts = toJournalEntry.lines
      .filter((line) => !toAccounts.has(line.account))
      .map((line) => ({ name: line.account, type: getAccountType(line.account), balance: 0 }));

    const updatedToEntity: Entity = {
      ...toEntity,
      payments: [...(toEntity.payments || []), incomingPayment],
      journal: [...(toEntity.journal || []), toJournalEntry],
      chartOfAccounts: [...(toEntity.chartOfAccounts || []), ...newToAccounts],
    };

    const updatedEntities = entities.map((e) => {
      if (e.id === fromEntityId) return updatedFromEntity;
      if (e.id === toEntityId) return updatedToEntity;
      return e;
    });

    auth.updateEntities(updatedEntities);
    setIsInternalTransferModalVisible(false);
  };

  const renderHomeView = () => {
    const sortedEntities = [...entities].sort(
      (a, b) => getEntityNetWorth(b) - getEntityNetWorth(a)
    );

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
          <div className="xl:col-span-2 min-w-0">
            <Dashboard
              entities={entities}
              onNavigate={handleViewChange}
              onDeleteEntity={promptDeleteEntity}
              onQuickAdd={() => setIsQuickAddModalVisible(true)}
            />
          </div>

          <div className="space-y-4 lg:space-y-6 min-w-0">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 sm:p-5 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                    Net Worth
                  </p>
                  <h3 className="mt-2 text-3xl font-semibold text-white">
                    {formatCurrency(getPortfolioNetWorth())}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Combined asset-minus-liability position across your current entities.
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                  Portfolio
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Entity Net Worth</h3>
                  <p className="text-sm text-slate-400">
                    Select an entity to review its internal position.
                  </p>
                </div>
              </div>

              <div className="space-y-3 max-h-[420px] sm:max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
                {sortedEntities.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-600 p-4 text-sm text-slate-400">
                    No entities yet. Add your first account or entity to begin tracking net worth.
                  </div>
                ) : (
                  sortedEntities.map((entity) => (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() => handleViewChange('entity', entity.id)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/40 hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-white">{entity.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                            {entity.type || 'Entity'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-semibold text-cyan-200">
                            {formatCurrency(getEntityNetWorth(entity))}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Click to open
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              Clear Flow platform access for records, dashboards, intake, and ledger operations.
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <button type="button" onClick={() => setIsTermsModalVisible(true)} className="text-slate-300 hover:text-white">
                Terms
              </button>
              <button type="button" onClick={() => setIsTermsModalVisible(true)} className="text-slate-300 hover:text-white">
                Privacy
              </button>
              <button type="button" className="text-slate-300 hover:text-white">
                Help
              </button>
              <button type="button" className="text-slate-300 hover:text-white">
                Contact
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return renderHomeView();

      case 'accounting':
        return <AccountingDashboard entities={entities} onNavigate={handleViewChange} />;

      case 'payments':
        return (
          <PaymentsDashboard
            entities={entities}
            onNewPaymentClick={() => setIsNewPaymentModalVisible(true)}
            onNewInternalTransferClick={() => setIsInternalTransferModalVisible(true)}
          />
        );

      case 'reserves':
        return <ReservesDashboard entities={entities} onUpdateEntity={handleEntityUpdate} />;

      case 'entity':
        return selectedEntity ? (
          <EntityDetail
            entity={selectedEntity}
            onBack={backToDashboard}
            onUpdate={handleEntityUpdate}
            onRefreshAuth={handleRefreshAuth}
            onRefreshIdentity={handleRefreshIdentity}
          />
        ) : (
          <div>Entity not found</div>
        );

      case 'addEntity':
        return (
          <div className="bg-slate-800/50 p-4 sm:p-6 lg:p-8 rounded-lg border border-slate-700 max-w-4xl mx-auto">
            <h2 className="text-3xl font-semibold mb-1 text-white">Register a New Entity or Account</h2>
            <p className="text-slate-400 mb-6">
              Provide details to set up accounting for your business entity or personal account.
            </p>

            <form onSubmit={saveEntity}>
              <fieldset className="border-t border-slate-600 pt-6">
                <legend className="text-lg font-medium text-blue-400">Account Details</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">
                  <div>
                    <input
                      id="entityName"
                      name="entityName"
                      type="text"
                      placeholder={isBusinessEntity ? 'Entity Name' : 'Personal Account Name'}
                      value={addEntityForm.entityName}
                      onChange={(e) => setAddEntityForm((f) => ({ ...f, entityName: e.target.value }))}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                    />
                  </div>

                  <select
                    id="entityType"
                    name="entityType"
                    value={addEntityForm.entityType}
                    onChange={handleEntityTypeChange}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                  >
                    <option>LLC</option>
                    <option>C-Corp</option>
                    <option>S-Corp</option>
                    <option>Trust/Estate</option>
                    <option>Non-profit</option>
                    <option>Personal</option>
                  </select>

                  {isBusinessEntity && (
                    <div className="md:col-span-2">
                      <input
                        id="ein"
                        name="ein"
                        type="text"
                        placeholder="Employer Identification Number (EIN)"
                        value={addEntityForm.ein}
                        onChange={handleEinChange}
                        required
                        className={`w-full bg-slate-900 border ${einError ? 'border-red-500' : 'border-slate-700'} rounded-md px-3 py-2`}
                      />
                      {einError && <p className="text-red-400 text-xs mt-1">{einError}</p>}
                    </div>
                  )}
                </div>
              </fieldset>

              <fieldset className="border-t border-slate-600 pt-6 mt-8">
                <legend className="text-lg font-medium text-blue-400">Financials</legend>
                <div className="mt-4 p-4 bg-slate-900/70 rounded-md border border-slate-700">
                  <h4 className="font-semibold">Connect Bank Account</h4>
                  <p className="text-sm text-slate-400 mt-1">
                    Bank connection is optional during onboarding. You can save this entity now and connect a bank later inside Accounting or Payments.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Optional now · recommended later for transaction sync, ACH, and vendor settlement workflows.
                  </p>

                  {!bankConnected ? (
                    <button
                      type="button"
                      onClick={() => setIsPlaidModalVisible(true)}
                      className="mt-4 px-5 py-2 text-white font-semibold rounded-md transition-colors text-sm bg-blue-600 hover:bg-blue-700"
                    >
                      Connect with Plaid
                    </button>
                  ) : (
                    <div className="mt-4 p-4 bg-slate-800 rounded-md border border-slate-600">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <div>
                            <h5 className="font-semibold text-slate-200">Bank Connected</h5>
                            {!!retrievedPlaidPayload?.authResponse.numbers.ach?.[0] && (
                              <p className="text-xs text-slate-400 font-mono">
                                Acct: ...{retrievedPlaidPayload.authResponse.numbers.ach[0].account.slice(-4)}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsPlaidModalVisible(true)}
                          className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-md text-xs"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {isBusinessEntity && (
                <fieldset className="border-t border-slate-600 pt-6 mt-8">
                  <legend className="text-lg font-medium text-blue-400">Verification</legend>
                  <div className="mt-4 p-4 bg-slate-900/70 rounded-md border border-slate-700">
                    <h4 className="font-semibold">Onboarding Document</h4>
                    <p className="text-sm text-slate-400 mt-1 mb-4">
                      Upload a verification document, like an IRS Form CP575, to support EIN confirmation. AI verification is optional and depends on a valid Gemini API key.
                    </p>
                    <div className="p-4 bg-slate-800 rounded-md border-2 border-dashed border-slate-600 text-center">
                      {!verificationFile ? (
                        <>
                          <input
                            id="verification-file-upload"
                            type="file"
                            onChange={onVerificationFileSelected}
                            accept="image/*, application/pdf"
                            className="hidden"
                          />
                          <label
                            htmlFor="verification-file-upload"
                            className="mt-2 inline-block cursor-pointer px-4 py-2 bg-slate-700 text-white font-semibold rounded-md text-sm hover:bg-slate-600"
                          >
                            Select Document
                          </label>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-center text-slate-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="font-medium truncate">{verificationFile.name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleVerifyDocument}
                            disabled={isVerifyingDoc}
                            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-md"
                          >
                            {isVerifyingDoc ? 'Verifying...' : 'Verify Document with AI'}
                          </button>
                        </>
                      )}
                    </div>

                    {verificationStatus !== 'idle' && (
                      <div
                        className={`rounded-md p-2 mt-4 text-sm font-medium flex items-center justify-center gap-2 ${
                          verificationStatus === 'verified'
                            ? 'bg-emerald-900/40 border border-emerald-500/30 text-emerald-300'
                            : 'bg-red-900/40 border border-red-500/30 text-red-300'
                        }`}
                      >
                        {verificationMessage}
                      </div>
                    )}
                  </div>
                </fieldset>
              )}

              <fieldset className="border-t border-slate-600 pt-6 mt-8">
                <legend className="text-lg font-medium text-blue-400">Agreement</legend>
                <div className="mt-4 p-4 bg-slate-900/70 rounded-md border border-slate-700">
                  <div className="flex items-start">
                    <input
                      id="terms-agreement"
                      name="terms-agreement"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500 mt-1"
                    />
                    <div className="ml-3 text-sm">
                      <label htmlFor="terms-agreement" className="font-medium text-slate-300">
                        I Agree to the Operating Agreement
                      </label>
                      <p className="text-slate-400">
                        By checking this box, I affirm that the information provided is accurate. I have reviewed and agree to the company&apos;s{' '}
                        <button
                          type="button"
                          onClick={() => setIsTermsModalVisible(true)}
                          className="text-blue-400 hover:underline font-medium"
                        >
                          Terms and Policies
                        </button>
                        .
                      </p>
                    </div>
                  </div>
                </div>
              </fieldset>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-10 border-t border-slate-700 pt-6">
                <button
                  type="button"
                  onClick={() => handleViewChange('home')}
                  className="w-full sm:w-auto px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isAddEntityFormValid}
                  className="w-full sm:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 disabled:cursor-not-allowed rounded-md"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        );

      case 'fundingRails':
        return <FundingRails onBack={backToDashboard} />;

      case 'oidDebtInstrument':
        return (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={backToDashboard}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-md"
              >
                Back to Dashboard
              </button>
            </div>
            <OIDDebtInstrumentModule />
          </div>
        );

      default:
        return <div>Not implemented</div>;
    }
  };

  const renderAuthenticatedView = () => {
    return (
      <div className="flex h-screen bg-slate-900 text-slate-200 antialiased">
        <Sidebar
          onNavigate={handleViewChange}
          entities={entities}
          onAddEntity={showAddEntityForm}
          onLogout={auth.logout}
          currentUser={auth.currentUser}
          currentView={currentView}
          activeEntityId={activeEntityId}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            view={currentView}
            entityName={selectedEntity?.name}
            savingStatus={auth.savingStatus}
            skin={skin}
            onToggleSkin={toggleSkin}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
            {renderView()}
          </main>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (auth.authStatus) {
      case 'unauthenticated':
        if (publicView === 'entry') {
          return (
            <EntryGateway
              onNewClient={() => {
                setMembershipIntakeDraft(null);
                setSelectedOnboardingPath(null);
                setHasAppliedIntakeDraft(false);
                clearStoredMembershipDraft();
                localStorage.removeItem(DRAFT_ID_STORAGE_KEY);
                setPublicView('pathSelect');
              }}
              onExistingClient={() => setPublicView('login')}
            />
          );
        }

        if (publicView === 'pathSelect') {
          return (
            <OnboardingPathSelect
              onBack={() => setPublicView('entry')}
              onSelectPath={(path) => {
                setSelectedOnboardingPath(path);
                setPublicView('intake');
              }}
            />
          );
        }

        if (publicView === 'intake' && selectedOnboardingPath) {
          return (
            <MembershipEstablishment
              selectedPath={selectedOnboardingPath}
              onBack={() => setPublicView('pathSelect')}
              onContinueToLogin={(draft) => {
                setMembershipIntakeDraft(draft);
                setHasAppliedIntakeDraft(false);
                setPublicView('login');
              }}
            />
          );
        }

        return (
          <div className="min-h-screen bg-slate-950 text-white">
            {membershipIntakeDraft && (
              <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                        Secure Sign-In Required
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        Your onboarding draft has been saved
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Continue with secure Google sign-in to activate your account and attach this onboarding record.
                      </p>

                      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                        <div>
                          <span className="text-slate-400">Entity / Account:</span>{' '}
                          {membershipIntakeDraft.legalName || '—'}
                        </div>
                        <div>
                          <span className="text-slate-400">Path:</span>{' '}
                          {membershipIntakeDraft.selectedPath}
                        </div>
                        <div>
                          <span className="text-slate-400">Representative:</span>{' '}
                          {membershipIntakeDraft.representativeName || '—'}
                        </div>
                        <div>
                          <span className="text-slate-400">EIN:</span>{' '}
                          {membershipIntakeDraft.ein || 'Not required / not entered'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPublicView('intake')}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
                    >
                      Edit Intake
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Welcome
              isConfigured={auth.isConfigured}
              onDevLogin={handleDevLogin}
            />
          </div>
        );

      case 'pending-gsi':
      case 'pending-drive-check':
        return (
          <div className="flex items-center justify-center min-h-screen">
            <div className="p-8 bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700 w-full max-w-md text-center">
              <div className="flex justify-center mb-6">
                <Logo height={60} />
              </div>
              <p className="text-slate-300 text-lg">Authenticating your session...</p>
              <div className="mt-6">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
              </div>
            </div>
          </div>
        );

      case 'pending-profile-setup':
        return <ProfileSetup />;

      case 'pending-verification':
        return <Verification />;

      case 'authenticated':
        return renderAuthenticatedView();

      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <>
      {renderContent()}

      {isPlaidModalVisible && (
        <PlaidLinkModal
          onClose={() => setIsPlaidModalVisible(false)}
          onConnected={handleBankConnected}
        />
      )}

      {isDeleteModalVisible && entityToDelete && (
        <ConfirmationModal
          title="Delete Entity"
          message={`Are you sure you want to delete ${entityToDelete.name}?`}
          onConfirm={confirmDelete}
          onClose={() => setIsDeleteModalVisible(false)}
        />
      )}

      {isTermsModalVisible && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 w-full max-w-3xl h-[80vh] flex flex-col rounded-lg shadow-2xl border border-slate-700">
            <div className="flex-shrink-0 p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-white">Terms, Privacy, and User Agreement</h3>
              <button onClick={() => setIsTermsModalVisible(false)} className="text-slate-400 hover:text-white">
                &times;
              </button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 custom-scrollbar text-sm text-slate-300 space-y-4">
              <div>
                <h4 className="text-white font-semibold mb-1">Platform Access</h4>
                <p>
                  Clear Flow provides software tools for record organization, intake, ledger workflows,
                  document storage, and internal dashboard access. Use of the platform is subject to account approval,
                  security review, and ongoing compliance with posted platform rules.
                </p>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-1">User Responsibility</h4>
                <p>
                  You are responsible for the accuracy of information, documents, financial records, and entity data
                  entered into the platform. You agree not to upload false, infringing, unlawful, or unauthorized material.
                </p>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-1">Privacy and Storage</h4>
                <p>
                  Data may be stored through connected services and platform infrastructure used to provide account access,
                  synchronization, and document retention. Additional privacy terms and retention details will be published
                  in the platform footer and support documentation.
                </p>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-1">Financial Tools Disclaimer</h4>
                <p>
                  Platform features may assist with bookkeeping, records, and workflow automation, but do not replace
                  legal, tax, accounting, or financial advice. Users remain responsible for independent review and compliance.
                </p>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-1">Service Changes</h4>
                <p>
                  Features, modules, access tiers, integrations, and availability may change over time as the platform expands.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isQuickAddModalVisible && (
        <QuickAddModal
          entities={entities}
          onClose={() => setIsQuickAddModalVisible(false)}
          onPostEntry={handlePostJournalEntry}
        />
      )}

      {isNewPaymentModalVisible && (
        <NewPaymentModal
          entities={entities.filter((e) => e.bankConnected)}
          onClose={() => setIsNewPaymentModalVisible(false)}
          onInitiatePayment={handleInitiatePayment}
        />
      )}

      {isInternalTransferModalVisible && (
        <InternalTransferModal
          entities={entities.filter((e) => e.bankConnected)}
          onClose={() => setIsInternalTransferModalVisible(false)}
          onInitiateTransfer={handleInitiateInternalTransfer}
        />
      )}
    </>
  );
};