import type {
  DocumentCategory,
  DocumentRecord,
  DocumentRetentionClass,
  DocumentStorageOwner,
} from '../types/core';

export interface DocumentStorageProfile {
  owner: DocumentStorageOwner;
  retentionClass: DocumentRetentionClass;
  ownerLabel: string;
  retentionLabel: string;
  userOwnedReady: boolean;
  externalStatus: 'not_applicable' | 'ready' | 'routed' | 'error';
  externalStatusLabel: string;
  driveEligible: boolean;
}

function inferRetentionClassFromCategory(category: DocumentCategory): DocumentRetentionClass {
  switch (category) {
    case 'tax':
      return 'tax';
    case 'authority_record':
      return 'authority';
    case 'compliance':
    case 'reserve_attestation':
    case 'compliance_classification_memo':
      return 'compliance';
    case 'financial':
    case 'title':
    case 'wallet_control_memo':
    case 'token_issuance_memo':
    case 'smart_contract_summary':
    case 'custody_resolution':
    case 'digital_asset_policy':
    case 'tx_audit_packet':
      return 'financial_evidence';
    case 'contract':
      return 'operational';
    default:
      return 'operational';
  }
}

function inferOwner(document: DocumentRecord): DocumentStorageOwner {
  if (document.storageOwner) {
    return document.storageOwner;
  }

  if (
    document.title.includes('ClearFlow User Terms') ||
    document.title.includes('ClearFlow Retained Security Record')
  ) {
    return 'clearflow_retained';
  }

  if (document.sourceRecordType === 'direct_deposit_request') {
    return 'clearflow_retained';
  }

  return 'user_owned';
}

function inferRetentionClass(document: DocumentRecord): DocumentRetentionClass {
  if (document.retentionClass) {
    return document.retentionClass;
  }

  if (document.title.includes('ClearFlow User Terms')) {
    return 'agreement';
  }

  if (document.title.includes('ClearFlow Retained Security Record')) {
    return 'security_support';
  }

  if (document.sourceRecordType === 'direct_deposit_request') {
    return 'payroll';
  }

  return inferRetentionClassFromCategory(document.category);
}

function formatRetentionLabel(retentionClass: DocumentRetentionClass) {
  switch (retentionClass) {
    case 'agreement':
      return 'Agreement';
    case 'security_support':
      return 'Security Support';
    case 'financial_evidence':
      return 'Financial Evidence';
    default:
      return retentionClass
        .split('_')
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
  }
}

export function getDocumentStorageProfile(document: DocumentRecord): DocumentStorageProfile {
  const owner = inferOwner(document);
  const retentionClass = inferRetentionClass(document);
  const hasVaultSource = Boolean(document.sourceFileId || document.vaultPath);
  const externalStatus =
    document.externalStorageStatus ||
    (owner === 'clearflow_retained'
      ? 'not_applicable'
      : hasVaultSource
        ? 'ready'
        : 'not_applicable');

  return {
    owner,
    retentionClass,
    ownerLabel: owner === 'clearflow_retained' ? 'ClearFlow retained' : 'User-owned workspace',
    retentionLabel: formatRetentionLabel(retentionClass),
    userOwnedReady: owner === 'user_owned' && hasVaultSource,
    externalStatus,
    externalStatusLabel:
      externalStatus === 'routed'
        ? 'Routed to drive'
        : externalStatus === 'ready'
          ? 'Ready for drive'
          : externalStatus === 'error'
            ? 'Drive routing error'
            : 'Internal only',
    driveEligible: owner === 'user_owned' && hasVaultSource,
  };
}

export function isClearFlowRetainedDocument(document: DocumentRecord) {
  return getDocumentStorageProfile(document).owner === 'clearflow_retained';
}

export function isUserOwnedReadyDocument(document: DocumentRecord) {
  return getDocumentStorageProfile(document).userOwnedReady;
}
