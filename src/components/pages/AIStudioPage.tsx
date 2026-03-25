import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  AIWorkflowRecord,
  CoreDataBundle,
  DocumentCategory,
  DocumentExternalStorageStatus,
  DocumentRecord,
  DocumentRetentionClass,
  DocumentStorageOwner,
  InstrumentRecord,
  ObligationRecord,
  TokenRecord,
} from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
import { saveDocumentFile } from '../../services/documentVault.service';
import { buildRemittanceRailControls } from '../../services/settlementRailing.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface AIStudioPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const researchLinks = [
  {
    title: 'Treasury Green Book',
    subtitle: 'Federal ACH guidance and returns',
    url: 'https://fiscal.treasury.gov/reference-guidance/green-book/index.html',
    detail: 'Reference Treasury guidance for federal ACH formats, returns, NOCs, and payment operations.',
  },
  {
    title: 'Treasury Gold Book',
    subtitle: 'Treasury check reclamation guidance',
    url: 'https://fiscal.treasury.gov/files/reference-guidance/gold-book/gold-book-full.pdf',
    detail: 'Review Treasury check reclamation procedures and exception handling for check-related payment operations.',
  },
  {
    title: 'IRS IRIS Portal',
    subtitle: 'File Forms 1099 online',
    url: 'https://www.irs.gov/filing/e-file-forms-1099-with-iris',
    detail: 'Launch the IRS Information Returns Intake System for online 1099 filing and status tracking.',
  },
  {
    title: 'IRS FIRE',
    subtitle: 'Bulk information return filing',
    url: 'https://fire.irs.gov/',
    detail: 'Use FIRE when a reporting team needs the traditional information return submission path.',
  },
  {
    title: 'IRS TIN Matching',
    subtitle: 'Taxpayer ID verification reference',
    url: 'https://www.irs.gov/tax-professionals/taxpayer-identification-number-tin-matching',
    detail: 'Use TIN matching guidance when preparing 1099 filing controls and payee verification workflows.',
  },
  {
    title: 'SEC EDGAR Search',
    subtitle: 'Issuer and filing research',
    url: 'https://www.sec.gov/edgar/search/',
    detail: 'Search public issuer filings, exhibits, and offering materials for identifier, issuer, and document support.',
  },
  {
    title: 'MSRB EMMA',
    subtitle: 'Municipal bond disclosure search',
    url: 'https://emma.msrb.org/',
    detail: 'Research municipal offerings, disclosures, and documents tied to municipal identifiers and issue history.',
  },
  {
    title: 'OpenFIGI Search',
    subtitle: 'Multi-source identifier mapping',
    url: 'https://www.openfigi.com/search',
    detail: 'Use FIGI mapping when CUSIP-adjacent identifier research is needed across public market datasets.',
  },
  {
    title: 'Federal Reserve Fedwire',
    subtitle: 'Wire operations reference',
    url: 'https://www.frbservices.org/financial-services/wires/',
    detail: 'Review Fedwire operating guidance, identifiers, and service references for wire movement controls.',
  },
  {
    title: 'Cornell LII UCC Library',
    subtitle: 'Commercial law reference',
    url: 'https://www.law.cornell.edu/ucc',
    detail: 'Reference UCC articles and core commercial-law text while drafting notes, assignments, and remittance logic.',
  },
];

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function focusDocument(documentId: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = `#documents:${documentId}`;
  }
}

function focusRoute(hash: string) {
  if (typeof window !== 'undefined') {
    window.location.hash = hash;
  }
}

function buildGeneratedDocument(input: {
  entityId: string;
  title: string;
  category: DocumentCategory;
  summary: string;
  templateKey?: DocumentRecord['templateKey'];
  body: string;
  storageOwner?: DocumentStorageOwner;
  retentionClass?: DocumentRetentionClass;
  storageNotes?: string;
  externalStorageStatus?: DocumentExternalStorageStatus;
}): DocumentRecord {
  const storageOwner = input.storageOwner || 'user_owned';
  const retentionClass =
    input.retentionClass ||
    (input.category === 'tax'
      ? 'tax'
      : input.category === 'compliance'
        ? 'compliance'
        : input.category === 'authority_record'
          ? 'authority'
          : 'operational');

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: input.entityId,
    title: input.title,
    category: input.category,
    date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    templateKey: input.templateKey,
    outputStatus: 'drafting',
    generatedBody: input.body,
    summary: input.summary,
    storageOwner,
    retentionClass,
    storageNotes:
      input.storageNotes ||
      (storageOwner === 'clearflow_retained'
        ? 'Studio-generated retained record intended to stay inside ClearFlow’s retained record layer.'
        : 'Studio-generated workspace packet ready for user-owned storage routing and vault review.'),
    externalStorageTarget: storageOwner === 'user_owned' ? 'google_drive' : undefined,
    externalStorageStatus:
      input.externalStorageStatus || (storageOwner === 'user_owned' ? 'ready' : 'not_applicable'),
  };
}

function buildInternalToken(input: {
  entityId: string;
  subjectType: TokenRecord['subjectType'];
  subjectId: string;
  label: string;
  proofReference: string;
}): TokenRecord {
  return {
    id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: input.entityId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    label: input.label,
    status: 'issued',
    tokenStandard: 'internal-proof',
    tokenReference: `AUTO-${Date.now()}`,
    issuedAt: new Date().toISOString(),
    proofReference: input.proofReference,
  };
}

function buildComplianceTag(input: {
  entityId: string;
  label: string;
  category: 'tax' | 'reporting' | 'authority' | 'risk' | 'entity' | 'jurisdiction' | 'asset' | 'digital_asset';
  status?: 'ok' | 'review' | 'restricted' | 'unknown';
  dueDate?: string;
  notes?: string;
  linkedDocumentIds?: string[];
}): CoreDataBundle['complianceTags'][number] {
  return {
    id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: input.entityId,
    label: input.label,
    category: input.category,
    status: input.status ?? 'review',
    dueDate: input.dueDate,
    notes: input.notes,
    linkedDocumentIds: input.linkedDocumentIds,
  };
}

export default function AIStudioPage({ data, setData }: AIStudioPageProps) {
  const auth = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const primaryEntity = data.entities[0];
  const digitalCount = data.aiWorkflows.filter((item) => item.category === 'digital_asset').length;
  const complianceCount = data.aiWorkflows.filter((item) => item.category === 'compliance').length;
  const remittanceRailControls = useMemo(() => buildRemittanceRailControls(data), [data]);
  const laneCounts = useMemo(
    () => ({
      legal: data.aiWorkflows.filter((item) => item.category === 'legal').length,
      financial: data.aiWorkflows.filter((item) => item.category === 'financial').length,
      operations: data.aiWorkflows.filter((item) => item.category === 'operations').length,
    }),
    [data.aiWorkflows],
  );

  const slugifyFileStem = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'clearflow-packet';

  const persistGeneratedDocumentRecord = async (document: DocumentRecord): Promise<DocumentRecord> => {
    if (!document.generatedBody) {
      return document;
    }

    try {
      const generatedFile = new File(
        [document.generatedBody],
        `${slugifyFileStem(document.title)}.md`,
        { type: 'text/markdown' },
      );
      const fileMetadata = await saveDocumentFile(`doc-generated-${document.id}`, generatedFile);
      const shouldAutoRoute =
        document.storageOwner === 'user_owned' &&
        data.workspaceSettings.autoRouteUserOwnedDocumentsToDrive &&
        auth.hasDriveAccess;
      const driveRoutingResult = shouldAutoRoute
        ? await auth.routeDocumentToDrive({
            sourceFileId: fileMetadata.sourceFileId,
            fileName: fileMetadata.fileName,
          })
        : null;

      return {
        ...document,
        fileName: fileMetadata.fileName,
        mimeType: fileMetadata.mimeType,
        sizeBytes: fileMetadata.sizeBytes,
        uploadedAt: fileMetadata.uploadedAt,
        sourceFileId: fileMetadata.sourceFileId,
        sourceRecordType: 'document',
        sourceRecordId: document.id,
        vaultPath: `/vault/${document.entityId}/documents/${fileMetadata.fileName}`,
        externalStorageTarget:
          document.storageOwner === 'user_owned' ? 'google_drive' : document.externalStorageTarget,
        externalStorageStatus:
          document.storageOwner === 'user_owned'
            ? driveRoutingResult?.success
              ? 'routed'
              : shouldAutoRoute
                ? 'error'
                : document.externalStorageStatus || 'ready'
            : document.externalStorageStatus || 'not_applicable',
        externalStorageFileId:
          document.storageOwner === 'user_owned' && driveRoutingResult?.success
            ? driveRoutingResult.fileId
            : document.externalStorageFileId,
        externalStorageLabel:
          document.storageOwner === 'user_owned'
            ? driveRoutingResult?.success
              ? 'Auto-routed to Google Drive'
              : shouldAutoRoute
                ? driveRoutingResult?.error || 'Automatic Google Drive routing failed'
                : document.externalStorageLabel || 'Ready for Google Drive routing'
            : document.externalStorageLabel,
        externalStorageRoutedAt:
          document.storageOwner === 'user_owned' && driveRoutingResult?.success
            ? new Date().toISOString()
            : document.externalStorageRoutedAt,
      };
    } catch (error) {
      console.warn('Failed to persist AI Studio generated document into the vault.', error);
      return {
        ...document,
        externalStorageStatus:
          document.storageOwner === 'user_owned' ? 'error' : document.externalStorageStatus,
        externalStorageLabel:
          document.storageOwner === 'user_owned'
            ? 'Vault persistence failed for this generated packet'
            : document.externalStorageLabel,
      };
    }
  };

  const appendDocument = async (document: DocumentRecord, tokens: TokenRecord[] = []) => {
    const persistedDocument = await persistGeneratedDocumentRecord(document);
    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      tokens: tokens.length ? [...tokens, ...prev.tokens] : prev.tokens,
    }));
    focusDocument(persistedDocument.id);
  };

  const appendDocumentBundle = async ({
    document,
    tokens = [],
    complianceTags = [],
    taxReportingLinks = [],
  }: {
    document: DocumentRecord;
    tokens?: TokenRecord[];
    complianceTags?: CoreDataBundle['complianceTags'];
    taxReportingLinks?: CoreDataBundle['taxReportingLinks'];
  }) => {
    const persistedDocument = await persistGeneratedDocumentRecord(document);
    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      tokens: tokens.length ? [...tokens, ...prev.tokens] : prev.tokens,
      complianceTags: complianceTags.length
        ? [...complianceTags, ...prev.complianceTags]
        : prev.complianceTags,
      taxReportingLinks: taxReportingLinks.length
        ? [...taxReportingLinks, ...prev.taxReportingLinks]
        : prev.taxReportingLinks,
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBusinessPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Business Document Packet`,
      category: 'governing',
      summary: 'Bundle for resolutions, operating procedures, vendor onboarding, and banking support.',
      body: `# Business Document Packet\n\nEntity: ${primaryEntity.displayName || primaryEntity.name}\n\n## Included Drafts\n- Operating resolution\n- Vendor onboarding cover letter\n- Banking support memo\n- Internal control checklist\n`,
    });

    void appendDocument(document);
  };

  const launchTrusteePacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Trustee Help Packet`,
      category: 'authority_record',
      summary: 'Trustee guidance, authority support, duty reminders, and execution checklist.',
      body: `# Trustee Help Packet\n\nTrust: ${primaryEntity.displayName || primaryEntity.name}\n\n## Trustee Checklist\n- Confirm authority documents are linked\n- Review current obligations and reserves\n- Update signer roles and communication paths\n- Prepare next compliance actions\n`,
    });

    void appendDocument(document);
  };

  const launchLogoBrief = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Logo Creator Brief`,
      category: 'other',
      summary: 'Brand and logo concept brief tied to entity identity and document style.',
      body: `# Logo Creator Brief\n\nBrand: ${primaryEntity.displayName || primaryEntity.name}\nAccent: ${primaryEntity.branding?.accentColor || data.workspaceSettings.preferredAccentColor || '#36d7ff'}\n\n## Goals\n- Luxe but youthful\n- Credible for finance and trusteeship\n- Strong icon for invoices, vault packets, and the sidebar shell\n`,
    });

    void appendDocument(document);
  };

  const launchStorageRetentionPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Storage & Retention Packet`,
      category: 'compliance',
      summary:
        'Workspace storage split packet covering user-owned drive routing, ClearFlow-retained records, and operational retention posture.',
      retentionClass: 'compliance',
      body: `# Storage & Retention Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## User-Owned Workspace Layer
- Operational uploads
- Working document packets
- Draft agreements and support memos
- Routing target: Google Drive when connected

## ClearFlow Retained Layer
- Accepted terms and conditions
- Internal security-support records
- Custody and compliance support records
- Records required for platform audit posture

## Operator Review
- Confirm which records are retained internally
- Confirm which packets should route to Google Drive
- Review tax, payroll, and authority retention requirements
`,
    });

    void appendDocument(document);
  };

  const launchPurchaseAgreement = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Purchase Agreement Draft`,
      category: 'contract',
      summary: 'Purchase agreement framework with parties, consideration, closing steps, and evidence checklist.',
      body: `# Purchase Agreement Draft\n\nSeller: ____________________\nBuyer: ${primaryEntity.displayName || primaryEntity.name}\n\n## Purchase Terms\n- Asset or rights being acquired\n- Consideration and settlement method\n- Transfer documents and closing deliverables\n- Default, cure, and dispute language\n`,
    });

    void appendDocument(document);
  };

  const launchTrustAdministrationPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Trust Administration Packet`,
      category: 'authority_record',
      summary:
        'Trustee operation packet for notices, minutes, authority support, and beneficiary administration notes.',
      body: `# Trust Administration Packet

Trust: ${primaryEntity.displayName || primaryEntity.name}

## Included Drafts
- Trustee action minutes
- Distribution review memo
- Beneficiary communication log
- Authority and duty checklist
- Reserve and remittance review page
`,
    });

    void appendDocument(document);
  };

  const launch1099PrepPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} 1099 Filing Prep Packet`,
      category: 'tax',
      summary:
        '1099 prep packet with payer setup, vendor readiness review, and filing checklist for IRIS/FIRE.',
      body: `# 1099 Filing Prep Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Filing Prep
- Confirm payer legal name and tax ID
- Review vendor classification and W-9 collection
- Reconcile reportable payment totals
- Select filing path: IRIS or FIRE
- Retain filing proof and exception notes
`,
    });

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'document',
      subjectId: document.id,
      label: '1099 Filing Prep Verification Token',
      proofReference: 'Issued when the 1099 prep packet is generated for controlled review.',
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} 1099 readiness review`,
      category: 'tax',
      dueDate: new Date().toISOString().slice(0, 10),
      notes: 'Generated from AI Studio to track 1099 prep and filing readiness.',
      linkedDocumentIds: [document.id],
    });

    const taxReportingLink = {
      id: `trl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: primaryEntity.id,
      railNamespace: 'irs_reporting' as const,
      counterpartyName: `${primaryEntity.displayName || primaryEntity.name} reporting queue`,
      tinMatchStatus: 'not_checked' as const,
      formType: '1099-MISC' as const,
      filingChannel: 'IRIS' as const,
      correctionStatus: 'none' as const,
      status: 'draft' as const,
      notes: 'Created from AI Studio 1099 filing prep flow for controlled review before filing.',
    };

    void appendDocumentBundle({
      document: {
        ...document,
        linkedTokenIds: [token.id],
        linkedComplianceTagIds: [complianceTag.id],
      },
      tokens: [token],
      complianceTags: [complianceTag],
      taxReportingLinks: [taxReportingLink],
    });
  };

  const launchIdentifierResearchPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Identifier Research Packet`,
      category: 'compliance',
      summary:
        'Research packet for CUSIP-adjacent identifier review, issuer lookup, and evidence logging.',
      body: `# Identifier Research Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Research Sources
- OpenFIGI mapping
- SEC EDGAR issuer and filing search
- EMMA for municipal records
- Internal instrument register cross-check

## Evidence Log
- Identifier searched
- Source used
- Match confidence
- Supporting filing or document reference
`,
    });

    void appendDocument(document);
  };

  const launchOperatingResolution = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Operating Resolution`,
      category: 'governing',
      summary:
        'Board, manager, or trustee operating resolution draft for banking authority, treasury control, and settlement approval posture.',
      body: `# Operating Resolution\n\nEntity: ${primaryEntity.displayName || primaryEntity.name}\n\n## Resolution Topics\n- Treasury and reserve authority\n- Banking and settlement authority\n- Token and document control standards\n- Officer / trustee execution authority\n- Record retention and reporting cadence\n`,
      templateKey: 'operating_agreement',
    });

    void appendDocument(document);
  };

  const launchContractorPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Contractor Engagement Packet`,
      category: 'contract',
      summary:
        'Independent contractor packet with scope, payment terms, 1099 posture, and onboarding checklist.',
      body: `# Contractor Engagement Packet\n\nHiring Entity: ${primaryEntity.displayName || primaryEntity.name}\n\n## Included Drafts\n- Contractor agreement shell\n- Scope of work page\n- Payment and reimbursement terms\n- 1099 / tax collection checklist\n- File return and vault retention notes\n`,
    });

    void appendDocument(document);
  };

  const launchW9CollectionPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} W-9 Collection Packet`,
      category: 'tax',
      summary:
        'Payee tax-intake packet for W-9 collection, TIN review, and vendor reporting support.',
      body: `# W-9 Collection Packet\n\nPayer: ${primaryEntity.displayName || primaryEntity.name}\n\n## Intake Steps\n- Request signed W-9 or equivalent taxpayer certification\n- Verify legal name and tax classification\n- Record TIN match result when available\n- Link retained form to vendor profile and 1099 queue\n`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} payee tax intake`,
      category: 'tax',
      notes: 'Collect and retain signed tax forms before 1099 filing or higher-risk vendor disbursement.',
      linkedDocumentIds: [document.id],
    });

    const taxReportingLink = {
      id: `trl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: primaryEntity.id,
      railNamespace: 'irs_reporting' as const,
      counterpartyName: 'Pending payee tax intake',
      tinMatchStatus: 'not_checked' as const,
      formType: 'other' as const,
      filingChannel: 'manual' as const,
      correctionStatus: 'none' as const,
      status: 'draft' as const,
      notes: 'Created from W-9 collection packet to track payee tax intake and retained forms.',
    };

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
      taxReportingLinks: [taxReportingLink],
    });
  };

  const launchDistributionMemo = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Distribution Review Memo`,
      category: 'legal_memo',
      summary:
        'Trust or entity distribution review memo for authority, reserves, beneficiaries, and remittance support.',
      body: `# Distribution Review Memo\n\nEntity or Trust: ${primaryEntity.displayName || primaryEntity.name}\n\n## Review Points\n- Governing document authority\n- Available reserve and treasury posture\n- Intended recipient / beneficiary\n- Tax and reporting treatment\n- Remittance statement and evidence support\n`,
    });

    void appendDocument(document);
  };

  const launchSecuredNotePackage = () => {
    if (!primaryEntity) {
      return;
    }

    const stamp = Date.now();
    const instrumentId = `ins-secured-${stamp}`;
    const obligationId = `obl-secured-${stamp}`;
    const documentId = `doc-secured-note-${stamp}`;
    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'instrument',
      subjectId: instrumentId,
      label: 'Secured Note Package Verification Token',
      proofReference: 'Issued automatically when a secured note package is drafted from the studio.',
    });

    const instrument: InstrumentRecord = {
      id: instrumentId,
      entityId: primaryEntity.id,
      title: `Secured Note Draft ${new Date().toISOString().slice(0, 10)}`,
      instrumentType: 'promissory_note',
      issueDate: new Date().toISOString().slice(0, 10),
      denominationValue: 25000,
      paymentMedium: 'mixed_contractual_tender',
      obligationType: 'secured_private_obligation',
      performanceSecurityStatus: 'posted',
      linkedDocumentIds: [documentId],
      notes: 'Studio-generated secured note package for collateral-aware ledger setup.',
    };

    const obligation: ObligationRecord = {
      id: obligationId,
      entityId: primaryEntity.id,
      title: `Secured Note Obligation ${new Date().toISOString().slice(0, 10)}`,
      obligationType: 'secured_private_obligation',
      amount: 25000,
      paymentMedium: 'mixed_contractual_tender',
      status: 'open',
      linkedInstrumentIds: [instrumentId],
      linkedDocumentIds: [documentId],
      gainOrLossOnDischarge: 0,
    };

    const document: DocumentRecord = {
      ...buildGeneratedDocument({
        entityId: primaryEntity.id,
        title: `Secured Note Collateral Packet ${new Date().toISOString().slice(0, 10)}`,
        category: 'financial',
        summary:
          'Secured note packet with collateral schedule, performance terms, and verification support.',
        body: `# Secured Note Package\n\nBorrower: ____________________\nLender: ${primaryEntity.displayName || primaryEntity.name}\nPrincipal: 25,000.00 USD\n\n## Collateral Schedule\n- Collateral description\n- Perfection or control support\n- Default and cure process\n- Treasury and remittance path\n`,
      }),
      id: documentId,
      linkedInstrumentIds: [instrumentId],
      linkedTokenIds: [token.id],
    };

    setData((prev) => ({
      ...prev,
      instruments: [instrument, ...prev.instruments],
      obligations: [obligation, ...prev.obligations],
      documents: [document, ...prev.documents],
      tokens: [token, ...prev.tokens],
    }));
    focusDocument(document.id);
  };

  const launchSecurityAgreement = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Security Agreement Draft`,
      category: 'contract',
      summary:
        'Security agreement draft for collateral description, remedies, and control documentation.',
      body: `# Security Agreement Draft\n\nSecured Party: ${primaryEntity.displayName || primaryEntity.name}\nDebtor: ____________________\n\n## Core Sections\n- Collateral description and schedules\n- Rights in proceeds and substitutions\n- Default and remedies\n- Control or perfection support\n- Notice and cure requirements\n`,
    });

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'document',
      subjectId: document.id,
      label: 'Security Agreement Draft Token',
      proofReference: 'Issued when a security agreement package is generated for controlled drafting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedTokenIds: [token.id] },
      tokens: [token],
    });
  };

  const launchTreasuryControlMemo = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Treasury Control Memo`,
      category: 'financial',
      summary:
        'Treasury control memo for reserve posture, release authority, remittance sequence, and settlement evidence.',
      body: `# Treasury Control Memo

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Treasury Scope
- Reserve account posture and liquidity lanes
- Settlement release authority and compliance-confirm posture
- Private-ledger discharge vs bank-rail discharge rules
- Evidence retention for remittance, returns, and exception handling
- Treasury-to-ERP posting checkpoints
`,
    });

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'document',
      subjectId: document.id,
      label: 'Treasury Control Memo Token',
      proofReference: 'Issued automatically when a treasury control memo is generated.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedTokenIds: [token.id] },
      tokens: [token],
    });
  };

  const launchBusinessBankingPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Business Banking Setup Packet`,
      category: 'financial',
      summary:
        'Business banking onboarding packet for KYB support, treasury mapping, signer support, and account-opening evidence.',
      templateKey: 'banking_setup',
      body: `# Business Banking Setup Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Included Support
- Entity profile and formation summary
- Signer and authority record checklist
- Treasury operating account request
- Bank-feed and reconciliation setup plan
- Required uploads and return path for the institution
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} banking onboarding review`,
      category: 'reporting',
      notes: 'Created from AI Studio to support business banking onboarding and retained packet workflow.',
      linkedDocumentIds: [document.id],
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchPayrollOnboardingPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Payroll Onboarding Packet`,
      category: 'financial',
      summary:
        'Payroll onboarding packet for employee intake, direct-deposit authorization, withholding, and record retention.',
      body: `# Payroll Onboarding Packet

Employer: ${primaryEntity.displayName || primaryEntity.name}

## Included Drafts
- Employee onboarding checklist
- Direct deposit authorization request cover note
- Withholding and tax intake checklist
- Payroll record retention instructions
- ERP setup and ledger mapping notes
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} payroll intake review`,
      category: 'tax',
      notes: 'Created from the payroll onboarding packet to track withholding and payroll intake readiness.',
      linkedDocumentIds: [document.id],
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchBeneficialOwnershipPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Beneficial Ownership Packet`,
      category: 'compliance',
      summary:
        'Ownership and control packet for banking, tax, and compliance onboarding with retained authority support.',
      body: `# Beneficial Ownership Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Packet Checklist
- Ownership and control persons
- Signer authority mapping
- Tax ID and jurisdiction support
- Banking / treasury ownership attestations
- Retained evidence for onboarding and compliance review
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} ownership and control review`,
      category: 'authority',
      notes: 'Generated from AI Studio to support beneficial ownership and authority review.',
      linkedDocumentIds: [document.id],
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launch1031ExchangePacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} 1031 Exchange Planning Packet`,
      category: 'tax',
      summary:
        '1031 exchange planning packet for relinquished property, replacement property, intermediary steps, and timing controls.',
      body: `# 1031 Exchange Planning Packet

Taxpayer / Entity: ${primaryEntity.displayName || primaryEntity.name}

## Planning Sections
- Relinquished property summary
- Replacement property targets
- Qualified intermediary coordination notes
- Identification and closing timeline controls
- Ledger and reserve impact review
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} 1031 exchange review`,
      category: 'tax',
      notes: 'Created from AI Studio to track 1031 exchange planning, document support, and timing controls.',
      linkedDocumentIds: [document.id],
    });

    appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchPromissoryNote = () => {
    if (!primaryEntity) {
      return;
    }

    const stamp = Date.now();
    const instrumentId = `ins-auto-${stamp}`;
    const obligationId = `obl-auto-${stamp}`;
    const documentId = `doc-auto-note-${stamp}`;

    const instrument: InstrumentRecord = {
      id: instrumentId,
      entityId: primaryEntity.id,
      title: `Private Promissory Note Draft ${new Date().toISOString().slice(0, 10)}`,
      instrumentType: 'promissory_note',
      issueDate: new Date().toISOString().slice(0, 10),
      denominationValue: 10000,
      paymentMedium: 'mixed_contractual_tender',
      obligationType: 'private_obligation',
      performanceSecurityStatus: 'none',
      linkedDocumentIds: [documentId],
      notes: 'Drafted from AI & Resource Studio for ledger-aware note setup.',
    };

    const obligation: ObligationRecord = {
      id: obligationId,
      entityId: primaryEntity.id,
      title: `Promissory Note Obligation ${new Date().toISOString().slice(0, 10)}`,
      obligationType: 'private_obligation',
      amount: 10000,
      paymentMedium: 'mixed_contractual_tender',
      status: 'open',
      linkedInstrumentIds: [instrumentId],
      linkedDocumentIds: [documentId],
      gainOrLossOnDischarge: 0,
    };

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'instrument',
      subjectId: instrumentId,
      label: 'Promissory Note Draft Verification Token',
      proofReference: 'Issued automatically when a note draft is created from the studio.',
    });

    const document: DocumentRecord = {
      ...buildGeneratedDocument({
        entityId: primaryEntity.id,
        title: `Promissory Note Draft Packet ${new Date().toISOString().slice(0, 10)}`,
        category: 'financial',
        summary: 'Ledger-aware promissory note packet with auth, performance, and settlement fields.',
        body: `# Promissory Note Draft\n\nBorrower: ____________________\nLender: ${primaryEntity.displayName || primaryEntity.name}\nPrincipal: 10,000.00 USD\n\n## Ledger Notes\n- Recognition occurs before cash if elected\n- Settlement path may be ledger, instrument, bank rail, or mixed discharge\n- Verification token should be confirmed before final issue\n`,
      }),
      id: documentId,
      linkedInstrumentIds: [instrumentId],
      linkedTokenIds: [token.id],
    };

    setData((prev) => ({
      ...prev,
      instruments: [instrument, ...prev.instruments],
      obligations: [obligation, ...prev.obligations],
      documents: [document, ...prev.documents],
      tokens: [token, ...prev.tokens],
      journalEntries: [
        {
          id: `je-auto-${stamp}`,
          entityId: primaryEntity.id,
          entryNumber: `${primaryEntity.numbering?.journalPrefix || 'JE'}-${stamp}`,
          entryDate: new Date().toISOString().slice(0, 10),
          memo: 'Draft recognition entry for promissory note workflow.',
          debitAccount: '1100 Notes Receivable',
          creditAccount: '2300 Note Obligation',
          amount: 10000,
          status: 'draft',
          source: 'system',
          linkedDocumentIds: [documentId],
          verificationRequired: true,
        },
        ...prev.journalEntries,
      ],
    }));
    focusDocument(document.id);
  };

  const launchSettlementRailAuditReport = () => {
    if (!primaryEntity) {
      return;
    }

    const blockedControls = remittanceRailControls.filter((item) => item.overallStatus === 'hold');
    const exceptionControls = remittanceRailControls.filter((item) => item.overallStatus === 'exception');
    const watchControls = remittanceRailControls.filter((item) => item.overallStatus === 'watch');
    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Settlement Rail Audit Report`,
      category: 'financial',
      summary:
        'Audit report across source control, proof posture, movement identifiers, return exposure, and reconciliation follow-up.',
      retentionClass: 'financial_evidence',
      body: `# Settlement Rail Audit Report

Entity: ${primaryEntity.displayName || primaryEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Rail Posture Summary
- Ready rails: ${remittanceRailControls.filter((item) => item.overallStatus === 'ready').length}
- Watch rails: ${watchControls.length}
- Held rails: ${blockedControls.length}
- Exceptions: ${exceptionControls.length}

## Held / Exception Items
${[...blockedControls, ...exceptionControls]
  .slice(0, 8)
  .map(
    (item) =>
      `- ${item.executionLabel} | ${item.railNamespace} | ${item.overallStatus}\n  ${item.recommendedAction}`,
  )
  .join('\n') || '- No held or exception rail items were open at report time.'}

## Watch Items
${watchControls
  .slice(0, 8)
  .map((item) => `- ${item.executionLabel} | ${item.recommendedAction}`)
  .join('\n') || '- No watch-only rail items were open at report time.'}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} settlement rail audit review`,
      category: 'risk',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio settlement rail audit reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchTreasuryReserveReport = () => {
    if (!primaryEntity) {
      return;
    }

    const entityTreasuries = data.treasuryAccounts.filter((item) => item.entityId === primaryEntity.id);
    const entityBankAccounts = data.bankAccounts.filter((item) => item.entityId === primaryEntity.id);
    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Treasury & Reserve Report`,
      category: 'financial',
      summary:
        'Treasury and reserve report covering available balances, remittance posture, linked banking, and reserve-backed settlements.',
      retentionClass: 'financial_evidence',
      body: `# Treasury & Reserve Report

Entity: ${primaryEntity.displayName || primaryEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Treasury Accounts
${entityTreasuries
  .map(
    (item) =>
      `- ${item.name} | ${item.treasuryType} | available ${item.currency} ${item.availableBalance.toLocaleString()} | reserved ${(item.reservedBalance || 0).toLocaleString()} | authority ${item.originatingAuthority}`,
  )
  .join('\n') || '- No treasury accounts are currently recorded for this entity.'}

## Linked Bank Accounts
${entityBankAccounts
  .map(
    (item) =>
      `- ${item.accountName} | ${item.institutionName} | ${item.connectionType || 'manual_bank'} | feed ${item.liveFeedStatus || 'not_connected'}`,
  )
  .join('\n') || '- No bank accounts are currently linked for this entity.'}

## Reserve-Backed Settlements
${data.settlements
  .filter((item) => item.entityId === primaryEntity.id && item.reserveBacked)
  .slice(0, 8)
  .map(
    (item) =>
      `- ${item.id} | ${item.path} | ${item.status} | ${item.currency} ${item.settledAmount.toLocaleString()} | ${item.verificationStatus}`,
  )
  .join('\n') || '- No reserve-backed settlements are currently recorded.'}
`,
    });

    void appendDocument(document);
  };

  const launchOperationsExceptionReport = () => {
    if (!primaryEntity) {
      return;
    }

    const reconciliationExceptions = data.reconciliations.filter(
      (item) =>
        item.entityId === primaryEntity.id &&
        (item.status !== 'completed' || item.statementReviewStatus === 'needs_review'),
    );
    const filingExceptions = data.taxReportingLinks.filter(
      (item) =>
        item.entityId === primaryEntity.id &&
        (item.status !== 'accepted' || item.tinMatchStatus === 'pending' || item.correctionStatus === 'pending'),
    );
    const returnExceptions = data.returnEvents.filter((item) => item.entityId === primaryEntity.id && item.status !== 'resolved');
    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Operations Exception Report`,
      category: 'compliance',
      summary:
        'Exception report across reconciliation, returns, rail posture, and filing readiness for operator follow-up.',
      retentionClass: 'compliance',
      body: `# Operations Exception Report

Entity: ${primaryEntity.displayName || primaryEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Reconciliation Queue
${reconciliationExceptions
  .map(
    (item) =>
      `- ${item.id} | ${item.periodStart} to ${item.periodEnd} | ${item.status} | review ${item.statementReviewStatus || 'not_imported'}`,
  )
  .join('\n') || '- No reconciliation exceptions are open.'}

## Return / Rail Exceptions
${returnExceptions
  .map((item) => `- ${item.code} | ${item.reason} | ${item.railNamespace} | ${item.status}`)
  .join('\n') || '- No return events are open.'}

## Filing Review
${filingExceptions
  .map(
    (item) =>
      `- ${item.counterpartyName} | ${item.formType || 'reporting link'} | TIN ${item.tinMatchStatus} | status ${item.status}`,
  )
  .join('\n') || '- No tax filing exceptions are open.'}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} operations exception review`,
      category: 'reporting',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio operations exception reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const studioTools: Array<{
    title: string;
    subtitle: string;
    detail: string;
    lane: 'entity' | 'trust' | 'ledger' | 'compliance' | 'operations';
    actionLabel: string;
    onAction: () => void;
  }> = [
    {
      title: 'Business Docs Builder',
      subtitle: 'Packets for operating, vendor, and bank support',
      detail: 'Create a working draft packet for business-facing documents and operating controls.',
      lane: 'entity',
      actionLabel: 'Create Packet',
      onAction: launchBusinessPacket,
    },
    {
      title: 'Operating Resolution',
      subtitle: 'Authority and treasury control language',
      detail: 'Create an operating resolution draft for banking authority, settlement controls, and records policy.',
      lane: 'entity',
      actionLabel: 'Draft Resolution',
      onAction: launchOperatingResolution,
    },
    {
      title: 'Trustee Support Desk',
      subtitle: 'Help for trustees and authority workflows',
      detail: 'Spin up a trustee guidance packet with duties, authority reminders, and next-action planning.',
      lane: 'trust',
      actionLabel: 'Create Trustee Packet',
      onAction: launchTrusteePacket,
    },
    {
      title: 'Distribution Review Memo',
      subtitle: 'Trust and entity distribution review support',
      detail: 'Create a memo for authority, reserve posture, beneficiary treatment, and remittance evidence.',
      lane: 'trust',
      actionLabel: 'Create Memo',
      onAction: launchDistributionMemo,
    },
    {
      title: 'Purchase Agreement Draft',
      subtitle: 'Acquisition papering and transfer support',
      detail: 'Draft a purchase agreement shell for assets, contract rights, or operating acquisitions.',
      lane: 'entity',
      actionLabel: 'Draft Agreement',
      onAction: launchPurchaseAgreement,
    },
    {
      title: 'Contractor Engagement Packet',
      subtitle: 'Onboarding plus 1099 posture support',
      detail: 'Create a contractor packet with agreement, onboarding, payment terms, and reporting checklist.',
      lane: 'operations',
      actionLabel: 'Create Packet',
      onAction: launchContractorPacket,
    },
    {
      title: 'Business Banking Setup',
      subtitle: 'Account-opening and treasury onboarding support',
      detail: 'Create a banking setup packet that can feed entity onboarding, document uploads, and treasury mapping.',
      lane: 'operations',
      actionLabel: 'Create Banking Packet',
      onAction: launchBusinessBankingPacket,
    },
    {
      title: 'Payroll Onboarding Packet',
      subtitle: 'Employee intake and deposit authorization support',
      detail: 'Create a payroll onboarding packet that supports employee intake, direct-deposit requests, and withholding setup.',
      lane: 'operations',
      actionLabel: 'Create Payroll Packet',
      onAction: launchPayrollOnboardingPacket,
    },
    {
      title: 'Trust Administration Packet',
      subtitle: 'Trustee minutes, beneficiary notes, and authority support',
      detail: 'Create a trustee-facing administration packet for decisions, distributions, and fiduciary recordkeeping.',
      lane: 'trust',
      actionLabel: 'Create Packet',
      onAction: launchTrustAdministrationPacket,
    },
    {
      title: 'Promissory Note Into Ledger',
      subtitle: 'Instrument, obligation, token, and journal draft in one move',
      detail: 'Create a note package that lands directly in instruments, obligations, documents, tokens, and journals.',
      lane: 'ledger',
      actionLabel: 'Draft Note Package',
      onAction: launchPromissoryNote,
    },
    {
      title: 'Secured Note Package',
      subtitle: 'Collateral-aware note drafting into ledger',
      detail: 'Create a secured note packet with collateral support, linked obligation, and verification token.',
      lane: 'ledger',
      actionLabel: 'Draft Secured Note',
      onAction: launchSecuredNotePackage,
    },
    {
      title: 'Security Agreement Draft',
      subtitle: 'Collateral and remedies support',
      detail: 'Create a security agreement draft with control, collateral, and default language support.',
      lane: 'ledger',
      actionLabel: 'Draft Agreement',
      onAction: launchSecurityAgreement,
    },
    {
      title: 'Treasury Control Memo',
      subtitle: 'Reserve, release, and settlement operating posture',
      detail: 'Generate a treasury control memo that maps reserve posture, release controls, and ERP settlement checkpoints.',
      lane: 'ledger',
      actionLabel: 'Create Memo',
      onAction: launchTreasuryControlMemo,
    },
    {
      title: '1099 Filing Prep',
      subtitle: 'IRIS/FIRE readiness and filing packet support',
      detail: 'Assemble a filing-prep packet with payer review, payee readiness, and controlled evidence support.',
      lane: 'compliance',
      actionLabel: 'Create 1099 Packet',
      onAction: launch1099PrepPacket,
    },
    {
      title: 'W-9 Collection Packet',
      subtitle: 'Tax intake and payee verification',
      detail: 'Create a W-9 collection packet that also opens a linked tax-intake compliance item.',
      lane: 'compliance',
      actionLabel: 'Create Intake Packet',
      onAction: launchW9CollectionPacket,
    },
    {
      title: 'Identifier Research Packet',
      subtitle: 'CUSIP-adjacent issuer and instrument lookup support',
      detail: 'Create a structured research packet for identifier mapping, issuer support, and document evidence.',
      lane: 'compliance',
      actionLabel: 'Create Research Packet',
      onAction: launchIdentifierResearchPacket,
    },
    {
      title: 'Beneficial Ownership Packet',
      subtitle: 'Ownership, control, and authority support',
      detail: 'Create an ownership and control packet for banking, tax, and authority onboarding workflows.',
      lane: 'compliance',
      actionLabel: 'Create Ownership Packet',
      onAction: launchBeneficialOwnershipPacket,
    },
    {
      title: '1031 Exchange Planning',
      subtitle: 'Exchange timing, property, and intermediary controls',
      detail: 'Create a 1031 planning packet for timeline controls, property support, and tax review routing.',
      lane: 'compliance',
      actionLabel: 'Create 1031 Packet',
      onAction: launch1031ExchangePacket,
    },
    {
      title: 'Logo Creator Brief',
      subtitle: 'Entity branding direction for packets and invoices',
      detail: 'Create a branding brief so logo and visual identity work can stay tied to the entity profile.',
      lane: 'entity',
      actionLabel: 'Create Brief',
      onAction: launchLogoBrief,
    },
    {
      title: 'Storage & Retention Packet',
      subtitle: 'User-owned drive routing and ClearFlow retained records',
      detail: 'Create a packet that explains storage split, Google Drive routing posture, and retained-record treatment for the workspace.',
      lane: 'operations',
      actionLabel: 'Create Storage Packet',
      onAction: launchStorageRetentionPacket,
    },
  ];

  const studioLanes: Array<{
    key: 'entity' | 'trust' | 'ledger' | 'compliance' | 'operations';
    title: string;
    description: string;
  }> = [
    {
      key: 'entity',
      title: 'Entity Launchers',
      description: 'Business formation, branding, operating resolutions, agreements, and onboarding packets.',
    },
    {
      key: 'trust',
      title: 'Trust & Fiduciary Tools',
      description: 'Trustee support, administration packets, distribution memos, and authority-centered documents.',
    },
    {
      key: 'ledger',
      title: 'Ledger & Filing Tools',
      description: 'Note drafting, secured obligations, tax filing prep, and identifier research tied back into records.',
    },
    {
      key: 'compliance',
      title: 'Compliance & Filing Tools',
      description: 'Tax intake, 1099 preparation, identifier research, and controlled filing support.',
    },
    {
      key: 'operations',
      title: 'Operations & Banking Tools',
      description: 'Payroll onboarding, banking setup, contractor intake, and operational packets that feed live desks.',
    },
  ];

  const recentGeneratedDocuments = data.documents
    .filter((document) => document.generatedBody || document.templateKey)
    .slice(0, 5);

  const integrationLaunchers = [
    {
      title: 'Google Drive Routing',
      subtitle: auth.hasDriveAccess ? 'Connected for user-owned routing' : 'Drive routing not connected',
      detail: auth.hasDriveAccess
        ? `${data.documents.filter((item) => item.externalStorageStatus === 'routed').length} documents already routed to Drive.`
        : 'Connect or review Drive routing posture for workspace-owned records.',
      actionLabel: auth.hasDriveAccess ? 'Open Documents' : 'Open Settings',
      actionHash: auth.hasDriveAccess ? '#documents' : '#settings',
    },
    {
      title: 'Bank Feed & Reconciliation',
      subtitle: `${data.bankAccounts.filter((item) => item.liveFeedStatus === 'connected').length} live feeds connected`,
      detail: `${data.reconciliations.filter((item) => item.status !== 'completed').length} reconciliations still need review or close work.`,
      actionLabel: 'Open Bank Feed',
      actionHash: '#accounting:bankFeed',
    },
    {
      title: 'Settlement Rail Controls',
      subtitle: `${remittanceRailControls.filter((item) => item.overallStatus !== 'ready').length} rail items need attention`,
      detail: `${remittanceRailControls.filter((item) => item.overallStatus === 'exception').length} exception rails and ${remittanceRailControls.filter((item) => item.overallStatus === 'hold').length} held rails are open.`,
      actionLabel: 'Open Payments Desk',
      actionHash: '#accounting:payments',
    },
    {
      title: 'Compliance & Filing',
      subtitle: `${data.taxReportingLinks.filter((item) => item.status !== 'accepted').length} filing links still active`,
      detail: `${data.complianceTags.filter((item) => item.status === 'review').length} compliance review items and ${data.returnEvents.filter((item) => item.status !== 'resolved').length} open returns are in queue.`,
      actionLabel: 'Open Compliance',
      actionHash: '#compliance',
    },
  ];

  const reportTools = [
    {
      title: 'Settlement Rail Audit',
      subtitle: 'Proof, trace, blocker, and exception report',
      detail: 'Create a report from the live rail control layer for remittance and settlement oversight.',
      actionLabel: 'Create Audit Report',
      onAction: launchSettlementRailAuditReport,
    },
    {
      title: 'Treasury & Reserve Report',
      subtitle: 'Reserve-backed balances and treasury posture',
      detail: 'Create a treasury report across reserve accounts, linked banks, and reserve-backed settlements.',
      actionLabel: 'Create Treasury Report',
      onAction: launchTreasuryReserveReport,
    },
    {
      title: 'Operations Exception Report',
      subtitle: 'Reconciliation, filing, and return exception packet',
      detail: 'Create an operator-ready packet of current reconciliation, filing, and rail exceptions.',
      actionLabel: 'Create Exception Report',
      onAction: launchOperationsExceptionReport,
    },
  ];

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const results = [
      ...data.entities.map((item) => ({
        id: `entity-${item.id}`,
        label: item.displayName || item.name,
        subtitle: `Entity | ${item.type}`,
        haystack: `${item.displayName || ''} ${item.name} ${item.type} ${item.jurisdiction || ''}`,
        hash: '#entities',
      })),
      ...data.documents.map((item) => ({
        id: `document-${item.id}`,
        label: item.title,
        subtitle: `Document | ${item.category}`,
        haystack: `${item.title} ${item.summary || ''} ${item.category} ${item.templateKey || ''}`,
        hash: `#documents:${item.id}`,
      })),
      ...data.payments.map((item) => ({
        id: `payment-${item.id}`,
        label: `${item.method.toUpperCase()} ${item.amount.toLocaleString()} ${item.currency}`,
        subtitle: `Payment | ${item.status}`,
        haystack: `${item.id} ${item.method} ${item.status} ${item.notes || ''}`,
        hash: '#accounting:payments',
      })),
      ...data.obligations.map((item) => ({
        id: `obligation-${item.id}`,
        label: item.title,
        subtitle: `Obligation | ${item.status}`,
        haystack: `${item.title} ${item.obligationType} ${item.status}`,
        hash: '#transactions',
      })),
      ...data.instruments.map((item) => ({
        id: `instrument-${item.id}`,
        label: item.title,
        subtitle: `Instrument | ${item.instrumentType}`,
        haystack: `${item.title} ${item.instrumentType} ${item.notes || ''}`,
        hash: '#transactions',
      })),
      ...data.complianceTags.map((item) => ({
        id: `compliance-${item.id}`,
        label: item.label,
        subtitle: `Compliance | ${item.category} | ${item.status}`,
        haystack: `${item.label} ${item.category} ${item.status} ${item.notes || ''} ${item.jurisdiction || ''}`,
        hash: item.linkedDocumentIds?.[0] ? `#documents:${item.linkedDocumentIds[0]}` : '#compliance',
      })),
      ...researchLinks.map((item) => ({
        id: `research-${item.title}`,
        label: item.title,
        subtitle: `Research | ${item.subtitle}`,
        haystack: `${item.title} ${item.subtitle} ${item.detail}`,
        hash: item.url,
        external: true,
      })),
    ];

    return results.filter((item) => item.haystack.toLowerCase().includes(query)).slice(0, 12);
  }, [data, searchQuery]);

  const resolveDocumentDesk = (document: DocumentRecord) => {
    if (document.category === 'tax' || document.category === 'compliance' || document.linkedComplianceTagIds?.length) {
      return { label: 'Open Compliance', hash: '#compliance' };
    }

    if (document.linkedInstrumentIds?.length || document.category === 'financial') {
      return { label: 'Open Transactions', hash: '#transactions' };
    }

    if (document.category === 'authority_record' || document.category === 'governing') {
      return { label: 'Open Entities', hash: '#entities' };
    }

    return { label: 'Open Documents', hash: `#documents:${document.id}` };
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>AI & Resource Studio</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Generators, research libraries, filing portals, and execution helpers for business, trust, and treasury work.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Workflows" value={data.aiWorkflows.length} />
        <StatCard label="Digital Asset Workflows" value={digitalCount} />
        <StatCard label="Compliance Workflows" value={complianceCount} />
        <StatCard label="Legal / Trust Tools" value={laneCounts.legal} />
        <StatCard label="Financial / Ledger Tools" value={laneCounts.financial} />
        <StatCard label="Operations Tools" value={laneCounts.operations} />
        <StatCard label="Output Formats" value="DOCX / PDF / Markdown" />
      </div>

      <PageSection
        title="Studio Search"
        description="Search live records, packets, compliance items, payments, obligations, and research sources from one place."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search entities, documents, payments, obligations, compliance, or research"
            style={{
              width: '100%',
              minHeight: 44,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(15,23,42,0.55)',
              color: '#e5e7eb',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'grid', gap: 12 }}>
            {searchQuery.trim() === '' ? (
              <WorkbenchRecordCard title="Search is ready" subtitle="Type to search">
                Search across the live workspace and the attached filing / authority research library.
              </WorkbenchRecordCard>
            ) : searchResults.length === 0 ? (
              <WorkbenchRecordCard title="No matches found" subtitle="Try a broader phrase">
                No current workspace records or research links matched that search.
              </WorkbenchRecordCard>
            ) : (
              searchResults.map((result) => (
                <WorkbenchRecordCard
                  key={result.id}
                  title={result.label}
                  subtitle={result.subtitle}
                  actionSlot={
                    <button
                      type="button"
                      onClick={() => (result.external ? openLink(result.hash) : focusRoute(result.hash))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(96,165,250,0.4)',
                        background: 'rgba(37,99,235,0.18)',
                        color: '#e5e7eb',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {result.external ? 'Open Source' : 'Open Result'}
                    </button>
                  }
                >
                  {result.subtitle}
                </WorkbenchRecordCard>
              ))
            )}
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Integration Launchers"
        description="Operational integration status and direct jumps into the desks that keep the system synchronized."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {integrationLaunchers.map((item) => (
            <WorkbenchRecordCard
              key={item.title}
              title={item.title}
              subtitle={item.subtitle}
              actionSlot={
                <button
                  type="button"
                  onClick={() => focusRoute(item.actionHash)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126, 242, 255, 0.28)',
                    background: 'rgba(54, 215, 255, 0.09)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {item.actionLabel}
                </button>
              }
            >
              {item.detail}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Report Generators"
        description="Generate live operating reports from current ERP, treasury, rail, and exception data."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {reportTools.map((tool) => (
            <WorkbenchRecordCard
              key={tool.title}
              title={tool.title}
              subtitle={tool.subtitle}
              actionSlot={
                <button
                  type="button"
                  onClick={tool.onAction}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126, 242, 255, 0.28)',
                    background: 'rgba(54, 215, 255, 0.09)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {tool.actionLabel}
                </button>
              }
            >
              {tool.detail}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      {studioLanes.map((lane) => (
        <div key={lane.key}>
          <PageSection title={lane.title} description={lane.description}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {studioTools
                .filter((tool) => tool.lane === lane.key)
                .map((tool) => (
                  <WorkbenchRecordCard
                    key={tool.title}
                    title={tool.title}
                    subtitle={tool.subtitle}
                    actionSlot={
                      <button
                        type="button"
                        onClick={tool.onAction}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(126, 242, 255, 0.28)',
                          background: 'rgba(54, 215, 255, 0.09)',
                          color: '#effcff',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {tool.actionLabel}
                      </button>
                    }
                  >
                    {tool.detail}
                  </WorkbenchRecordCard>
                ))}
            </div>
          </PageSection>
        </div>
      ))}

      <PageSection
        title="Research & Filing Library"
        description="Official portals and research surfaces that operators reach for every week."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {researchLinks.map((resource) => (
            <WorkbenchRecordCard
              key={resource.title}
              title={resource.title}
              subtitle={resource.subtitle}
              actionSlot={
                <button
                  type="button"
                  onClick={() => openLink(resource.url)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(96,165,250,0.4)',
                    background: 'rgba(37,99,235,0.18)',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Open
                </button>
              }
            >
              {resource.detail}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Recent Studio Outputs"
        description="Jump back into the latest generated packets without hunting through the vault."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {recentGeneratedDocuments.length === 0 ? (
            <WorkbenchRecordCard title="No generated outputs yet" subtitle="Launch a tool to begin">
              Studio-generated packets will appear here for quick re-entry into the vault workflow.
            </WorkbenchRecordCard>
          ) : (
            recentGeneratedDocuments.map((document) => (
              <WorkbenchRecordCard
                key={document.id}
                title={document.title}
                subtitle={`${document.category} | ${document.outputStatus || document.status} | ${document.date}`}
                summaryItems={[
                  {
                    label: 'Entity',
                    value:
                      data.entities.find((entity) => entity.id === document.entityId)?.displayName ||
                      document.entityId,
                  },
                  { label: 'Template', value: document.templateKey || 'custom' },
                  { label: 'Tokens', value: document.linkedTokenIds?.length || 0 },
                  {
                    label: 'Storage',
                    value:
                      document.storageOwner === 'clearflow_retained'
                        ? 'ClearFlow retained'
                        : document.externalStorageStatus === 'routed'
                          ? 'Drive routed'
                          : 'Workspace / drive-ready',
                  },
                ]}
                actionSlot={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => focusDocument(document.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(96,165,250,0.4)',
                        background: 'rgba(37,99,235,0.18)',
                        color: '#e5e7eb',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Open in Vault
                    </button>
                    <button
                      type="button"
                      onClick={() => focusRoute(resolveDocumentDesk(document).hash)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(126, 242, 255, 0.28)',
                        background: 'rgba(54, 215, 255, 0.09)',
                        color: '#effcff',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {resolveDocumentDesk(document).label}
                    </button>
                  </div>
                }
              >
                {document.summary || 'Generated output ready for review in the vault.'}
              </WorkbenchRecordCard>
            ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Generator Catalog"
        description="Structured workflow records still available for deeper configuration and advanced editing."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.aiWorkflows.map((workflow: AIWorkflowRecord) => (
            <WorkbenchRecordCard
              key={workflow.id}
              title={workflow.name}
              subtitle={workflow.category}
              summaryItems={[
                { label: 'Outputs', value: workflow.outputTypes.join(', ') },
                { label: 'Category', value: workflow.category },
              ]}
              record={workflow}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  aiWorkflows: prev.aiWorkflows.map((item) =>
                    item.id === workflow.id ? nextRecord : item
                  ),
                }))
              }
            >
              {workflow.description}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
