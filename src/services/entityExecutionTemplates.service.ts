import type {
  BankOnboardingChecklistItem,
  DocumentRecord,
  EntityRecord,
} from '../types/core';

function entityDisplay(entity: EntityRecord) {
  return entity.displayName || entity.name;
}

export function buildExecutionDocumentBody(
  templateKey: NonNullable<DocumentRecord['templateKey']>,
  entity: EntityRecord,
  context?: Record<string, string | undefined>
) {
  const display = entityDisplay(entity);
  const representative = entity.representativeName || 'Authorized Representative';
  const representativeRole = entity.representativeRole || 'Representative';
  const jurisdiction = entity.jurisdiction || 'Jurisdiction to confirm';

  switch (templateKey) {
    case 'formation_packet':
      return `ENTITY FORMATION PACKET\n\nEntity: ${display}\nType: ${entity.type}\nJurisdiction: ${jurisdiction}\nFormation Date: ${entity.formationDate || 'To be confirmed'}\nTax ID: ${entity.taxId || 'Pending'}\nRepresentative: ${representative} (${representativeRole})\n\nObjective\nEstablish the operating identity, governing posture, and immediate launch controls for ${display}.\n\nInitial Actions\n1. Confirm governing document stack.\n2. Confirm tax registration and filing posture.\n3. Confirm signer and authority records.\n4. Confirm banking and treasury setup.\n\nNotes\n${context?.notes || 'Complete this packet with filing details, governing references, and any beneficial owner support.'}`;
    case 'signer_assignment':
      return `SIGNER ASSIGNMENT MEMO\n\nEntity: ${display}\nSigner: ${context?.signerName || representative}\nRole: ${context?.signerRole || representativeRole}\nEffective Date: ${context?.effectiveDate || 'To be confirmed'}\nContact: ${context?.signerEmail || context?.signerPhone || 'Pending'}\n\nAuthority Scope\nThe signer is being assigned authority to act for ${display} within the limits documented in the related authority record and banking controls.\n\nAcceptance Steps\n1. Review assignment scope.\n2. Accept or decline authority.\n3. Confirm reply-to and notification channel.\n4. Attach signed acknowledgment if required.`;
    case 'banking_setup':
      return `BANKING SETUP PACKET\n\nEntity: ${display}\nTarget Institution: ${context?.institutionName || 'Pending institution'}\nOperating Currency: ${entity.operationalDefaults?.baseCurrency || 'USD'}\nPrimary Signer: ${context?.signerName || representative}\n\nRequired Support\n- Tax registration support\n- Governing authority resolution\n- Signer identification and acceptance\n- Settlement instructions and treasury defaults\n\nExecution Notes\n${context?.notes || 'Use this packet to gather onboarding documents, confirm signer authority, and move the account from draft to connected.'}`;
    case 'operating_agreement':
      return `GOVERNING AGREEMENT DRAFT\n\nEntity: ${display}\nType: ${entity.type}\nJurisdiction: ${jurisdiction}\nRepresentative: ${representative}\n\nDrafting Goals\n1. Define ownership and management authority.\n2. Define approvals, distributions, and operating controls.\n3. Define banking, treasury, and records rules.\n4. Define amendment and dispute procedures.\n\nOpen Items\n${context?.notes || 'Insert managers, members, trustees, voting thresholds, and recordkeeping requirements.'}`;
    case 'compliance_kickoff':
      return `COMPLIANCE KICKOFF MEMO\n\nEntity: ${display}\nJurisdiction: ${jurisdiction}\nLaunch Date: ${context?.effectiveDate || new Date().toISOString().slice(0, 10)}\n\nInitial Control Tracks\n1. Annual report / entity maintenance\n2. Tax registration and filing readiness\n3. Governing document retention\n4. Banking and authority support files\n\nFollow-Up Notes\n${context?.notes || 'Assign owners to each control track and confirm due dates once filings and registrations are verified.'}`;
    default:
      return `${display} operating document draft`;
  }
}

export function buildBankOnboardingChecklist(linkedDocumentIds: {
  packetDocumentId?: string;
  taxDocumentId?: string;
  authorityDocumentId?: string;
}) {
  const checklist: BankOnboardingChecklistItem[] = [
    {
      id: `chk-${Date.now()}-packet`,
      label: 'Review banking setup packet',
      status: 'ready',
      linkedDocumentId: linkedDocumentIds.packetDocumentId,
    },
    {
      id: `chk-${Date.now()}-tax`,
      label: 'Attach EIN / tax registration support',
      status: linkedDocumentIds.taxDocumentId ? 'ready' : 'pending',
      linkedDocumentId: linkedDocumentIds.taxDocumentId,
    },
    {
      id: `chk-${Date.now()}-authority`,
      label: 'Attach authority resolution or signer memo',
      status: linkedDocumentIds.authorityDocumentId ? 'ready' : 'pending',
      linkedDocumentId: linkedDocumentIds.authorityDocumentId,
    },
    {
      id: `chk-${Date.now()}-submit`,
      label: 'Mark banking package ready for submission',
      status: 'pending',
    },
  ];

  return checklist;
}
