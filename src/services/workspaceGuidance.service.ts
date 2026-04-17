import type { AppSection, CoreDataBundle, EntityRecord } from '../types/core';
import { buildTreasuryPresentmentMailTodos } from './treasuryPresentmentMail.service';

export interface WorkspaceGuideCard {
  title: string;
  subtitle: string;
  description: string;
  route: string;
  routeLabel: string;
}

export interface WorkspaceRequiredAction {
  title: string;
  description: string;
  route: string;
  routeLabel: string;
  severity: 'high' | 'medium' | 'low';
}

export interface EntityChecklistSummary {
  entityId: string;
  entityLabel: string;
  items: Array<{
    label: string;
    done: boolean;
  }>;
  readyCount: number;
  totalCount: number;
}

export interface WorkspaceGuidanceSummary {
  deskGuides: WorkspaceGuideCard[];
  requiredActions: WorkspaceRequiredAction[];
  entityChecklists: EntityChecklistSummary[];
}

function describeEntity(entity: EntityRecord) {
  return entity.displayName || entity.name;
}

function buildEntityChecklist(entity: EntityRecord, data: CoreDataBundle): EntityChecklistSummary {
  const hasAuthorityReady =
    Boolean(entity.representativeName && entity.representativeRole && entity.authorityAttestedAt) &&
    (entity.authorityProofStatus === 'matched' || entity.authorityProofStatus === 'similar_match') &&
    !entity.authorityTransactionsPaused;
  const hasStorageMapped = Boolean(entity.entityAccess?.storageMode);
  const hasBankOrTreasury =
    data.bankAccounts.some((account) => account.entityId === entity.id) ||
    data.treasuryAccounts.some((account) => account.entityId === entity.id);
  const hasCounterpartySetup =
    data.vendors.some((vendor) => vendor.entityId === entity.id) ||
    data.customers.some((customer) => customer.entityId === entity.id);
  const hasDocuments = data.documents.some((document) => document.entityId === entity.id);

  const items = [
    { label: 'Authority proof cleared', done: hasAuthorityReady },
    { label: 'Storage mapped', done: hasStorageMapped },
    { label: 'Bank or treasury connected', done: hasBankOrTreasury },
    { label: 'Vendor or customer records started', done: hasCounterpartySetup },
    { label: 'Documents retained', done: hasDocuments },
  ];

  return {
    entityId: entity.id,
    entityLabel: describeEntity(entity),
    items,
    readyCount: items.filter((item) => item.done).length,
    totalCount: items.length,
  };
}

export function buildWorkspaceGuidanceSummary(data: CoreDataBundle): WorkspaceGuidanceSummary {
  const deskGuides: WorkspaceGuideCard[] = [
    {
      title: 'Overview',
      subtitle: 'Start here each session',
      description:
        'Use Overview as the operator inbox. It tells you what needs attention across entities, accounting, documents, and settlement.',
      route: '#overview',
      routeLabel: 'Open Overview',
    },
    {
      title: 'Entities',
      subtitle: 'Establish the operating board first',
      description:
        'Create entities, clear authority, map storage, and prepare the board before banking or external release.',
      route: '#entities',
      routeLabel: 'Open Entities',
    },
    {
      title: 'Accounting',
      subtitle: 'ERP work happens here',
      description:
        'Use Accounting for invoices, bills, remittances, journals, bank feed, and reconciliation. Stay inside this desk for ERP flow.',
      route: '#accounting:dashboard',
      routeLabel: 'Open Accounting',
    },
    {
      title: 'Assets & Reserve',
      subtitle: 'Custody, metals, wallets, reserve posture',
      description:
        'Use Assets for wallets, reserve assets, precious-metal collateral, and digital holdings tied into treasury or bond support.',
      route: '#assets',
      routeLabel: 'Open Assets',
    },
    {
      title: 'AI & Resource Studio',
      subtitle: 'Learn, generate, and research',
      description:
        'Use the studio as the learning hub, packet generator, and reference desk when you need guidance or structured outputs.',
      route: '#aiStudio',
      routeLabel: 'Open Studio',
    },
  ];

  const requiredActions: WorkspaceRequiredAction[] = [];
  const treasuryPresentmentMailTodos = buildTreasuryPresentmentMailTodos(data);

  if (data.entities.length === 0) {
    requiredActions.push({
      title: 'Create your first entity',
      description:
        'The app becomes much easier once work is anchored to a real entity board with authority, storage, and accounting context.',
      route: '#entities:new',
      routeLabel: 'Add Entity',
      severity: 'high',
    });
  }

  const authorityHeldEntities = data.entities.filter(
    (entity) =>
      entity.authorityTransactionsPaused ||
      entity.authorityProofStatus === 'missing' ||
      entity.authorityProofStatus === 'review' ||
      entity.authorityProofStatus === 'mismatch'
  );
  if (authorityHeldEntities.length > 0) {
    requiredActions.push({
      title: 'Clear authority review',
      description: `${authorityHeldEntities.length} entity board(s) can keep collecting data, but release should stay paused until authority proof is cleared.`,
      route: '#entities',
      routeLabel: 'Resolve Authority',
      severity: 'high',
    });
  }

  if (data.entities.length > 0 && data.bankAccounts.length === 0) {
    requiredActions.push({
      title: 'Connect banking or treasury',
      description:
        'Connect a live bank, card, processor, or treasury account so accounting and payment rails have a real source/destination.',
      route: '#accounting:bankFeed',
      routeLabel: 'Open Bank Feed',
      severity: 'medium',
    });
  }

  if (data.entities.length > 0 && data.vendors.length === 0 && data.customers.length === 0) {
    requiredActions.push({
      title: 'Start counterparties',
      description:
        'Add vendors or customers early so bills, invoices, and remittances connect to real counterparty records instead of staying ad hoc.',
      route: '#accounting:vendors',
      routeLabel: 'Open Vendors',
      severity: 'medium',
    });
  }

  if (data.documents.length === 0) {
    requiredActions.push({
      title: 'Add key records to the vault',
      description:
        'Upload trust papers, certificates, bills, contracts, and proof packets so workflow decisions can rely on retained records.',
      route: '#documents:upload',
      routeLabel: 'Upload Documents',
      severity: 'medium',
    });
  }

  if (treasuryPresentmentMailTodos.length > 0) {
    requiredActions.push({
      title: 'Mail instrument presentment packet',
      description: `${treasuryPresentmentMailTodos.length} executed note/bond/instrument item(s) need registered/certified mail presentment instructions, USPS/EPS evidence, and returned-response tracking.`,
      route: '#assets',
      routeLabel: 'Open Presentment Mail',
      severity: 'high',
    });
  }

  const entityChecklists = data.entities.map((entity) => buildEntityChecklist(entity, data));

  return {
    deskGuides,
    requiredActions,
    entityChecklists,
  };
}
