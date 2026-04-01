import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  AIWorkflowRecord,
  CoreDataBundle,
  DocumentCategory,
  DocumentExternalStorageStatus,
  DocumentRecord,
  DocumentRetentionClass,
  DocumentStorageOwner,
  HolderLedgerEntryRecord,
  InstrumentRecord,
  InstrumentSettlementRecord,
  NegotiableInstrumentRegisterRecord,
  ObligationRecord,
  TokenRecord,
} from '../../types/core';
import { useAuth } from '../../hooks/useAuth';
import { saveDocumentFile } from '../../services/documentVault.service';
import { buildDispatchFooter } from '../../services/dispatchIdentity.service';
import { buildRemittanceRailControls } from '../../services/settlementRailing.service';
import { buildTransactionProofChainViews } from '../../services/transactionProofChain.service';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface AIStudioPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

type ReportWindowOption = '30d' | '90d' | '365d' | 'all';

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
    title: 'IRS Forms & Instructions',
    subtitle: 'Current tax form library and filing instructions',
    url: 'https://www.irs.gov/forms-instructions',
    detail: 'Open the IRS forms library for current tax forms, instructions, and schedules used in operating, payroll, and information-return workflows.',
  },
  {
    title: 'EFTPS',
    subtitle: 'Treasury federal tax payment enrollment and payments',
    url: 'https://www.eftps.gov/eftps/',
    detail: 'Open Treasury EFTPS for business enrollment, scheduled federal tax payments, and payment-history access.',
  },
  {
    title: 'FinCEN Beneficial Ownership',
    subtitle: 'BOI and ownership reporting guidance',
    url: 'https://www.fincen.gov/beneficial-ownership-information-reporting-rule-fact-sheet',
    detail: 'Review FinCEN beneficial ownership guidance and use it to structure ownership, control-person, and reporting review workflows.',
  },
  {
    title: 'FinCEN CDD Rule',
    subtitle: 'Customer due diligence requirements',
    url: 'https://www.fincen.gov/resources/statutes-regulations/cdd-final-rule',
    detail: 'Use FinCEN customer due diligence guidance when building KYB, beneficial-owner refresh, and control-person verification workflows.',
  },
  {
    title: 'FinCEN SAR Filing',
    subtitle: 'Suspicious activity reporting reference',
    url: 'https://www.fincen.gov/suspicious-activity-report-sar',
    detail: 'Review SAR filing expectations when casework rises from watchlist or transaction-monitoring review into escalation.',
  },
  {
    title: 'FinCEN CTR Filing',
    subtitle: 'Currency transaction reporting reference',
    url: 'https://www.fincen.gov/currency-transaction-reporting',
    detail: 'Use CTR filing guidance when large currency activity or structured cash patterns need case and filing preparation.',
  },
  {
    title: 'OFAC Sanctions Search',
    subtitle: 'Treasury sanctions screening reference',
    url: 'https://ofac.treasury.gov/sanctions-programs-and-country-information',
    detail: 'Use Treasury sanctions references when clearing entities, counterparties, control persons, or wallet relationships for banking and payment activity.',
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
    title: 'MSRB Muni ETF Liquidity Paper',
    subtitle: 'Market structure and liquidity research',
    url: 'https://www.msrb.org/sites/default/files/2025-11/Liquidity-Impact-of-Municipal-Bond-ETFs-on-Municipal-Securities-Market.pdf',
    detail: 'Review municipal bond ETF liquidity research and use it to support reserve-paper review, trading posture, and municipal identifier workflows.',
  },
  {
    title: 'OpenFIGI Search',
    subtitle: 'Multi-source identifier mapping',
    url: 'https://www.openfigi.com/search',
    detail: 'Use FIGI mapping when CUSIP-adjacent identifier research is needed across public market datasets.',
  },
  {
    title: 'TreasuryDirect Marketable Securities',
    subtitle: 'Treasury paper reference and issue data',
    url: 'https://www.treasurydirect.gov/marketable-securities/',
    detail: 'Review Treasury notes, bonds, bills, and TIPS program references when reserve or ledger holdings include sovereign paper.',
  },
  {
    title: 'FINRA Fixed Income',
    subtitle: 'Bond market data and fixed-income reference',
    url: 'https://www.finra.org/finra-data/fixed-income',
    detail: 'Use FINRA fixed-income market references when intake or review work expands beyond municipal paper into broader bond and dealer-market holdings.',
  },
  {
    title: 'USPS Business Customer Gateway',
    subtitle: 'Business mail, permits, MIDs, and service enrollment',
    url: 'https://gateway.usps.com/',
    detail: 'Open USPS Business Customer Gateway for business account access, Mailer IDs, permits, and postal service enrollment.',
  },
  {
    title: 'USPS PDX API',
    subtitle: 'Parcel Data Exchange API for shipping files',
    url: 'https://postalpro.usps.com/shipping/parcel-data-exchange-pdx-api',
    detail: 'Review USPS Parcel Data Exchange for manifest-file transmission and outbound extracts using Business Customer Gateway credentials.',
  },
  {
    title: 'Federal Reserve Fedwire',
    subtitle: 'Wire operations reference',
    url: 'https://www.frbservices.org/financial-services/wires/',
    detail: 'Review Fedwire operating guidance, identifiers, and service references for wire movement controls.',
  },
  {
    title: 'IRS IRM Remittance Processing',
    subtitle: 'IRS handling posture for non-standard remittances',
    url: 'https://www.irs.gov/irm/part3/irm_03-008-045r',
    detail: 'Review the Internal Revenue Manual before treating drafts, special instruments, or other imperfect remittances as accepted tax payments.',
  },
  {
    title: 'Cornell LII UCC Library',
    subtitle: 'Commercial law reference',
    url: 'https://www.law.cornell.edu/ucc',
    detail: 'Reference UCC articles and core commercial-law text while drafting notes, assignments, and remittance logic.',
  },
  {
    title: 'UCC 3-104',
    subtitle: 'Negotiable instrument elements',
    url: 'https://www.law.cornell.edu/ucc/3/3-104',
    detail: 'Use UCC 3-104 to confirm the formal elements of a negotiable draft or bill of exchange.',
  },
  {
    title: 'UCC 3-107',
    subtitle: 'Instrument payable in foreign money',
    url: 'https://www.law.cornell.edu/ucc/3/3-107',
    detail: 'Use UCC 3-107 when the draft is payable in foreign money or needs international currency language.',
  },
  {
    title: 'UCC 3-409',
    subtitle: 'Acceptance of draft',
    url: 'https://www.law.cornell.edu/ucc/3/3-409',
    detail: 'Review acceptance rules before treating a drawee as obligated on an international bill of exchange.',
  },
  {
    title: 'UCC 3-501',
    subtitle: 'Presentment procedure',
    url: 'https://www.law.cornell.edu/ucc/3/3-501',
    detail: 'Use UCC 3-501 when structuring presentment, dishonor, and evidence flow for drafts and exchange instruments.',
  },
];

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildEntityCode(label?: string) {
  const cleaned = (label || 'ENTITY').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 10) || 'ENTITY';
}

function buildEmmaSearchUrl(identifierCode?: string) {
  if (!identifierCode) {
    return 'https://emma.msrb.org/';
  }

  return `https://emma.msrb.org/`;
}

function getReportWindowLabel(window: ReportWindowOption) {
  switch (window) {
    case '30d':
      return 'Last 30 days';
    case '90d':
      return 'Last 90 days';
    case '365d':
      return 'Last 12 months';
    case 'all':
    default:
      return 'Full history';
  }
}

function getReportWindowStart(window: ReportWindowOption) {
  if (window === 'all') {
    return null;
  }

  const now = new Date();
  const start = new Date(now);
  const offsetDays = window === '30d' ? 30 : window === '90d' ? 90 : 365;
  start.setDate(now.getDate() - offsetDays);
  return start;
}

function isOnOrAfterWindow(dateValue: string | undefined, window: ReportWindowOption) {
  if (!dateValue || window === 'all') {
    return true;
  }

  const start = getReportWindowStart(window);
  if (!start) {
    return true;
  }

  const candidate = new Date(dateValue);
  if (Number.isNaN(candidate.getTime())) {
    return true;
  }

  return candidate >= start;
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

function formatDispatchMethod(
  method?: CoreDataBundle['dispatchRecords'][number]['method']
) {
  switch (method) {
    case 'internal_clearflow':
      return 'Internal ClearFlow';
    case 'postal_mail':
      return 'Postal dispatch';
    case 'email':
      return 'Email';
    case 'manual_upload':
      return 'Manual upload';
    case 'external_courier':
      return 'Courier';
    default:
      return 'To be inserted';
  }
}

function buildEntityDocumentBrandingAppendix(
  entity?: CoreDataBundle['entities'][number]
) {
  if (!entity?.branding) {
    return '';
  }

  const sealSvg = entity.branding.entitySealSvg;
  const logoText = entity.branding.documentLogoText || entity.displayName || entity.name;
  const footerNote = entity.branding.invoiceFooterNote;
  const signerLabel = entity.representativeName || entity.ownerDisplay || entity.displayName || entity.name;

  return `\n\n## Entity Branding Layer\n**${logoText}**\n\n${
    sealSvg
      ? `<div style="display:flex;justify-content:center;padding:12px 0;">${sealSvg}</div>\n\n`
      : ''
  }${footerNote ? `_${footerNote}_\n\n` : ''}## Signature Support\n| Authorized Signature | Seal / Stamp |\n| --- | --- |\n| ________________________________  \n${signerLabel} | ${entity.branding.entityProofSealCode || 'Entity seal retained on profile'} |\n`;
}

export default function AIStudioPage({ data, setData }: AIStudioPageProps) {
  const auth = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [reportEntityId, setReportEntityId] = useState(() => data.entities[0]?.id || '');
  const [reportWindow, setReportWindow] = useState<ReportWindowOption>('90d');
  const primaryEntity = data.entities[0];
  const digitalCount = data.aiWorkflows.filter((item) => item.category === 'digital_asset').length;
  const complianceCount = data.aiWorkflows.filter((item) => item.category === 'compliance').length;
  const remittanceRailControls = useMemo(() => buildRemittanceRailControls(data), [data]);
  const transactionProofChains = useMemo(() => buildTransactionProofChainViews(data), [data]);
  const paymentsById = useMemo(
    () => new Map(data.payments.map((payment) => [payment.id, payment])),
    [data.payments],
  );
  const laneCounts = useMemo(
    () => ({
      legal: data.aiWorkflows.filter((item) => item.category === 'legal').length,
      financial: data.aiWorkflows.filter((item) => item.category === 'financial').length,
      operations: data.aiWorkflows.filter((item) => item.category === 'operations').length,
    }),
    [data.aiWorkflows],
  );
  const reportEntity = useMemo(
    () => data.entities.find((item) => item.id === reportEntityId) || primaryEntity,
    [data.entities, primaryEntity, reportEntityId],
  );
  const reportWindowLabel = useMemo(() => getReportWindowLabel(reportWindow), [reportWindow]);
  const linkedEftpsTreasury = useMemo(
    () => data.treasuryAccounts.find((item) => item.id === data.workspaceSettings.eftpsLinkedTreasuryAccountId),
    [data.treasuryAccounts, data.workspaceSettings.eftpsLinkedTreasuryAccountId],
  );
  const linkedEftpsBank = useMemo(
    () => data.bankAccounts.find((item) => item.id === data.workspaceSettings.eftpsLinkedBankAccountId),
    [data.bankAccounts, data.workspaceSettings.eftpsLinkedBankAccountId],
  );
  const linkedEftpsLedger = useMemo(
    () => data.ledgerAccounts.find((item) => item.id === data.workspaceSettings.eftpsTaxLedgerAccountId),
    [data.ledgerAccounts, data.workspaceSettings.eftpsTaxLedgerAccountId],
  );
  const linkedUspsBank = useMemo(
    () => data.bankAccounts.find((item) => item.id === data.workspaceSettings.uspsLinkedBankAccountId),
    [data.bankAccounts, data.workspaceSettings.uspsLinkedBankAccountId],
  );
  const linkedUspsPostageLedger = useMemo(
    () => data.ledgerAccounts.find((item) => item.id === data.workspaceSettings.uspsPostageLedgerAccountId),
    [data.ledgerAccounts, data.workspaceSettings.uspsPostageLedgerAccountId],
  );
  const reportScopeSummary = useMemo(() => {
    if (!reportEntity) {
      return null;
    }

    const scopedPayments = data.payments.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.paymentDate, reportWindow),
    );
    const scopedDocuments = data.documents.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.date, reportWindow),
    );
    const scopedCompliance = data.complianceTags.filter((item) => item.entityId === reportEntity.id);
    const scopedTaxLinks = data.taxReportingLinks.filter((item) => item.entityId === reportEntity.id);
    const scopedProofChains = transactionProofChains.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.date, reportWindow),
    );
    const scopedRailIssues = remittanceRailControls.filter((item) => {
      const payment = paymentsById.get(item.paymentId);
      return (
        payment?.entityId === reportEntity.id &&
        isOnOrAfterWindow(payment.paymentDate, reportWindow) &&
        item.overallStatus !== 'ready'
      );
    });

    return {
      payments: scopedPayments.length,
      documents: scopedDocuments.length,
      complianceReviews: scopedCompliance.filter((item) => item.status === 'review').length,
      filingItems: scopedTaxLinks.filter((item) => item.status !== 'accepted').length,
      railIssues: scopedRailIssues.length,
      proofChains: scopedProofChains.length,
    };
  }, [data.complianceTags, data.documents, data.payments, data.taxReportingLinks, paymentsById, remittanceRailControls, reportEntity, reportWindow, transactionProofChains]);

  const taxScopeSummary = useMemo(() => {
    if (!reportEntity) {
      return null;
    }

    const taxDocuments = data.documents.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        item.category === 'tax' &&
        isOnOrAfterWindow(item.date, reportWindow),
    );
    const filingLinks = data.taxReportingLinks.filter((item) => item.entityId === reportEntity.id);
    const openFilingLinks = filingLinks.filter((item) => item.status !== 'accepted');
    const tinReviewItems = filingLinks.filter(
      (item) => item.tinMatchStatus === 'pending' || item.tinMatchStatus === 'not_checked',
    );
    const employeeRecords = data.employees.filter((item) => item.entityId === reportEntity.id);
    const contractorRecords = employeeRecords.filter((item) => item.employeeType === 'contractor');
    const payrollRecords = employeeRecords.filter((item) => item.employeeType !== 'contractor');

    return {
      taxDocuments: taxDocuments.length,
      openFilingLinks: openFilingLinks.length,
      tinReviewItems: tinReviewItems.length,
      contractorRecords: contractorRecords.length,
      payrollRecords: payrollRecords.length,
    };
  }, [data.documents, data.employees, data.taxReportingLinks, reportEntity, reportWindow]);

  useEffect(() => {
    if (!reportEntityId && primaryEntity) {
      setReportEntityId(primaryEntity.id);
      return;
    }

    if (reportEntityId && !data.entities.some((item) => item.id === reportEntityId) && primaryEntity) {
      setReportEntityId(primaryEntity.id);
    }
  }, [data.entities, primaryEntity, reportEntityId]);

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
      const entity = data.entities.find((item) => item.id === document.entityId);
      const dispatchFooter =
        entity?.branding?.autoGenerateDispatchIdentity
          ? buildDispatchFooter({
              mailingLine: entity.branding.entityMailingLine,
              proofSealCode: entity.branding.entityProofSealCode,
              qrPayload: entity.branding.entityQrPayload,
            })
          : '';
      const brandingAppendix = buildEntityDocumentBrandingAppendix(entity);
      const documentBody = `${document.generatedBody}${brandingAppendix}${dispatchFooter}`;
      const generatedFile = new File(
        [documentBody],
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
            entityId: document.entityId,
            targetGoogleEmail:
              entity?.entityAccess?.googleStorageEmail || entity?.primaryEmail,
          })
        : null;

      return {
        ...document,
        generatedBody: documentBody,
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

  const launchTaxFormGeneratorPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Tax Form Generator Packet`,
      category: 'tax',
      summary:
        'Multi-form tax packet for payer, payee, payroll, withholding, and information-return workflows.',
      body: `# Tax Form Generator Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Common Form Paths
- W-9: U.S. payee tax certification, classification, and TIN collection
- W-8BEN / W-8BEN-E: non-U.S. beneficial owner certification and treaty posture
- 1099-NEC / 1099-MISC: information return support for contractors, vendors, and reportable payments
- W-2: employee wage reporting and annual payroll close
- Form 941: quarterly federal payroll tax return
- Form 940: annual federal unemployment return

## Intake Checklist
- Confirm legal entity name and tax ID
- Confirm worker or payee classification
- Verify address, withholding, and backup-withholding posture
- Reconcile reportable totals to ERP activity
- Route signed forms into retained tax records

## Output Notes
- Link payee-facing forms to vendor, employee, or contractor records
- Create or update the 1099 queue when reportable payments apply
- Retain filing proof, corrections, and exception notes
`,
    });

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'document',
      subjectId: document.id,
      label: 'Tax Form Generator Verification Token',
      proofReference: 'Issued when the broader tax form generator packet is created for controlled review.',
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} tax form generation review`,
      category: 'tax',
      dueDate: new Date().toISOString().slice(0, 10),
      notes:
        'Generated from AI Studio to coordinate multi-form tax intake, payroll filing, and information-return readiness.',
      linkedDocumentIds: [document.id],
    });

    const taxReportingLink = {
      id: `trl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: primaryEntity.id,
      railNamespace: 'irs_reporting' as const,
      counterpartyName: `${primaryEntity.displayName || primaryEntity.name} tax operations queue`,
      tinMatchStatus: 'pending' as const,
      formType: 'other' as const,
      filingChannel: 'manual' as const,
      correctionStatus: 'none' as const,
      status: 'draft' as const,
      notes:
        'Created from the tax form generator packet to track broader tax-form prep, filing follow-through, and retained records.',
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

  const launchEftpsOperationsPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} EFTPS Operations Packet`,
      category: 'tax',
      summary:
        'Federal tax payment setup packet for EFTPS enrollment, deposit scheduling, payment evidence, and Treasury control notes.',
      body: `# EFTPS Operations Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Enrollment and Access
- Confirm EIN and IRS address of record
- Confirm the business taxpayer is enrolled in EFTPS
- Record whether the enrollment PIN has been received by U.S. Mail
- Record the responsible signer or operator for payment scheduling
- Maintain Login.gov or ID.me access notes separately from ClearFlow secrets

## Payment Control
- Map federal deposit categories by entity and obligation type
- Track due dates and 8 p.m. ET cutoff on the day before the due date
- Retain confirmation numbers, scheduled dates, and settlement dates
- Record whether payment was initiated directly in EFTPS, by ACH credit, or by wire alternative

## ClearFlow Follow-Through
- Link payment evidence into the tax and treasury records
- Reconcile EFTPS payments against payroll, estimated tax, or information-return support
- Preserve Treasury-facing evidence and internal approval notes
`,
    });

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'document',
      subjectId: document.id,
      label: 'EFTPS Operations Verification Token',
      proofReference: 'Issued when the EFTPS operations packet is generated for controlled treasury and tax-payment setup.',
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} EFTPS payment controls`,
      category: 'tax',
      dueDate: new Date().toISOString().slice(0, 10),
      notes: 'Track EFTPS enrollment, deposit scheduling controls, and retained federal payment evidence.',
      linkedDocumentIds: [document.id],
    });

    void appendDocumentBundle({
      document: {
        ...document,
        linkedTokenIds: [token.id],
        linkedComplianceTagIds: [complianceTag.id],
      },
      tokens: [token],
      complianceTags: [complianceTag],
    });
  };

  const launchUspsBusinessGatewayPacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} USPS Business Gateway Packet`,
      category: 'compliance',
      summary:
        'USPS business-mail and parcel-operations packet for Business Customer Gateway, PostalOne, permits, and PDX/eVS readiness.',
      body: `# USPS Business Gateway Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Account Setup
- Confirm USPS Business Customer Gateway username and business profile
- Record CRID, Mailer ID (MID), and linked permit posture
- Record whether a Business Service Administrator is designated
- Identify which services are in use: PostalOne, eVS, PRS, PDX, or mailing activity only

## Operational Controls
- Link postage, mailing, or manifest activity to the right entity ledger
- Track permit balances, fees, and statement evidence
- Preserve manifest, acceptance, and outbound extract files
- Maintain role ownership for mailing, audit, and electronic verification activity

## ClearFlow Follow-Through
- Route mailing evidence and manifests into retained or user-owned storage as needed
- Reconcile postage and shipping activity into ERP/accounting
- Track counterparties, return activity, and permit-linked records
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} USPS gateway setup review`,
      category: 'reporting',
      dueDate: new Date().toISOString().slice(0, 10),
      notes: 'Track Business Customer Gateway, PostalOne, permit, and parcel-data setup for the entity.',
      linkedDocumentIds: [document.id],
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
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

  const launchKybRefreshPacket = async () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} KYC / KYB Refresh Packet`,
      category: 'compliance',
      summary:
        'Refresh packet for customer due diligence, ownership review, document coverage, and screening readiness.',
      retentionClass: 'compliance',
      body: `# KYC / KYB Refresh Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Refresh Checklist
- Confirm legal entity name and tax classification
- Refresh ownership and control-person details
- Verify address, jurisdiction, and formation support
- Confirm bank and payment use cases
- Review screening, sanctions, and adverse-media posture
- Link retained documents and next review date
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} KYC / KYB refresh`,
      category: 'entity',
      notes: 'Generated from AI Studio to refresh onboarding and ongoing diligence posture.',
      linkedDocumentIds: [document.id],
    });

    const kybReview = {
      id: `kyb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: primaryEntity.id,
      reviewType: 'kyb' as const,
      status: 'pending' as const,
      reviewDate: new Date().toISOString().slice(0, 10),
      nextReviewDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10),
      beneficialOwnerCount: 0,
      documentCoverage: 'partial' as const,
      screeningStatus: 'not_run' as const,
      linkedDocumentIds: [document.id],
      linkedComplianceTagIds: [complianceTag.id],
      notes: 'Refresh review opened from AI Studio packet generation.',
    };

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
      kybReviews: [kybReview, ...prev.kybReviews],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchWatchlistReviewPacket = async () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Watchlist Review Packet`,
      category: 'compliance',
      summary:
        'Sanctions, PEP, adverse-media, and control-person watchlist review packet for payment and banking readiness.',
      retentionClass: 'compliance',
      body: `# Watchlist Review Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Screening Scope
- OFAC and sanctions references
- Control persons and beneficial owners
- Counterparties and high-value vendors
- Wallet or destination screening where applicable
- Disposition, escalation, and re-screen cadence
`,
    });

    const screening = {
      id: `watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: primaryEntity.id,
      subjectType: 'entity' as const,
      subjectLabel: primaryEntity.displayName || primaryEntity.name,
      screeningScope: 'multi' as const,
      status: 'watch' as const,
      screenedAt: new Date().toISOString().slice(0, 10),
      nextScreeningDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
      providerLabel: 'AI Studio review launch',
      disposition: 'pending_review' as const,
      linkedDocumentIds: [document.id],
      notes: 'Screening queue item generated from AI Studio to begin sanctions and adverse-media review.',
    };

    const persistedDocument = await persistGeneratedDocumentRecord(document);
    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      watchlistScreenings: [screening, ...prev.watchlistScreenings],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchAmlCasePacket = async () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} AML Case Packet`,
      category: 'compliance',
      summary:
        'Case packet for suspicious activity, currency activity, watchlist escalation, and filing-prep support.',
      retentionClass: 'compliance',
      body: `# AML Case Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Case Build
- Trigger summary
- Linked transactions or payments
- Watchlist or KYB refresh linkage
- SAR / CTR path assessment
- Internal rationale and retention horizon
`,
    });

    const amlCase = {
      id: `aml-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: primaryEntity.id,
      caseType: 'suspicious_activity' as const,
      title: `${primaryEntity.displayName || primaryEntity.name} AML review case`,
      status: 'open' as const,
      priority: 'elevated' as const,
      openedAt: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString().slice(0, 10),
      linkedDocumentIds: [document.id],
      filingPath: 'SAR' as const,
      filingStatus: 'draft' as const,
      retentionUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5)
        .toISOString()
        .slice(0, 10),
      notes: 'Case opened from AI Studio for investigation and filing-prep support.',
    };

    const persistedDocument = await persistGeneratedDocumentRecord(document);
    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      amlCases: [amlCase, ...prev.amlCases],
    }));
    focusDocument(persistedDocument.id);
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

  const launchInternationalBillOfExchangePacket = async () => {
    if (!primaryEntity) {
      return;
    }

    const stamp = Date.now();
    const issueDate = new Date().toISOString().slice(0, 10);
    const maturityDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const entityLabel = primaryEntity.displayName || primaryEntity.name;
    const entityCode = buildEntityCode(entityLabel);
    const currency = primaryEntity.operationalDefaults?.baseCurrency || 'USD';
    const legalIdentifier = `${entityCode}-IBOE-${issueDate.replace(/-/g, '')}-${String(stamp).slice(-4)}`;
    const instrumentId = `ins-iboe-${stamp}`;
    const obligationId = `obl-iboe-${stamp}`;
    const documentId = `doc-iboe-${stamp}`;
    const amount = 25000;

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'instrument',
      subjectId: instrumentId,
      label: 'International Bill of Exchange Verification Token',
      proofReference:
        'Issued automatically when an international bill of exchange packet is generated for presentment and acceptance review.',
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${entityLabel} bill of exchange presentment review`,
      category: 'risk',
      dueDate: issueDate,
      notes:
        'Confirm UCC draft formalities, foreign-money language, drawee acceptance posture, presentment evidence, and any IRM special-handling caveat before relying on the instrument externally.',
      linkedDocumentIds: [documentId],
    });

    const instrument: InstrumentRecord = {
      id: instrumentId,
      entityId: primaryEntity.id,
      title: `International Bill of Exchange Draft ${issueDate}`,
      instrumentType: 'bill_of_exchange',
      legalIdentifier,
      sourceClass: 'other',
      marketSector: 'private',
      identifierCode: `${currency}-IBOE`,
      issuerName: entityLabel,
      issueDate,
      maturityDate,
      denominationValue: amount,
      paymentMedium: 'mixed_contractual_tender',
      obligationType: 'private_obligation',
      counterpartyLabel: 'Named drawee / acceptor to be completed at issuance',
      performanceSecurityStatus: 'none',
      linkedTokenIds: [token.id],
      linkedDocumentIds: [documentId],
      notes:
        'Studio-generated international bill of exchange draft for controlled ledger tracking, presentment review, acceptance handling, and foreign-money / remittance analysis.',
    };

    const obligation: ObligationRecord = {
      id: obligationId,
      entityId: primaryEntity.id,
      title: `Bill of Exchange Obligation ${issueDate}`,
      legalIdentifier,
      obligationType: 'private_obligation',
      amount,
      paymentMedium: 'mixed_contractual_tender',
      status: 'open',
      linkedInstrumentIds: [instrumentId],
      linkedDocumentIds: [documentId],
      lifecycleStage: 'presentment_due',
      gainOrLossOnDischarge: 0,
      enforcementMemo:
        'Treat external enforceability, acceptance, dishonor, protest, and any tax-remittance use as counsel-and-operations review items, not automatic acceptance.',
    };

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${entityLabel} International Bill of Exchange Packet`,
      category: 'financial',
      summary:
        'Ledger-aware international bill of exchange packet with UCC-style draft elements, presentment and acceptance workflow, and IRM remittance caution notes.',
      retentionClass: 'financial_evidence',
      body: `# International Bill of Exchange Draft Packet

Entity: ${entityLabel}
Issue Date: ${issueDate}
Maturity / Review Date: ${maturityDate}
Draft Identifier: ${legalIdentifier}

## Face Draft Elements
- Drawer: ${entityLabel}
- Drawee / Acceptor: ____________________
- Payee / Holder: ____________________
- Place of Issue: ____________________
- Amount Certain: ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}
- Foreign Money Option: If issued in stated foreign money, review UCC 3-107 and any governing-law conflict rules before release.
- Tenor: At sight / ___ days after sight / on definite date

## Order to Pay
Pay against this bill of exchange the stated sum in lawful money or stated foreign money, according to the accepted tenor, without offset except as shown on the face of the instrument or controlling agreement.

## Presentment and Acceptance
- Present the draft to the named drawee and record date, place, and method of presentment.
- Do not treat the drawee as obligated until acceptance posture is confirmed and evidenced.
- If dishonored, log the exception, supporting notices, and any protest or reservation memo.

## Ledger and Control Notes
- Link the draft to the underlying obligation, reserve source, and remittance path before issue.
- Maintain holder-chain, endorsement, and assignment support in the instrument register.
- Capture identifiers, verification tokens, and settlement references in ClearFlow before external use.

## IRM / Special Handling Note
- If this draft is ever used in a federal-tax or other remittance context, do not assume acceptance merely because it was tendered.
- Route the item for special handling, evidence retention, and operator review under the applicable IRS or receiving-party procedures.

## Operator Review
- Confirm UCC Article 3 draft formalities and any international presentment requirements.
- Confirm governing law, venue, notice, and protest language with counsel if the instrument will be used externally.
- Confirm whether the item is tracking-only, controlled private presentment, or intended for third-party bank-sponsored handling.
`,
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      id: documentId,
      linkedInstrumentIds: [instrumentId],
      linkedTokenIds: [token.id],
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      instruments: [instrument, ...prev.instruments],
      obligations: [obligation, ...prev.obligations],
      documents: [persistedDocument, ...prev.documents],
      tokens: [token, ...prev.tokens],
      complianceTags: [complianceTag, ...prev.complianceTags],
      journalEntries: [
        {
          id: `je-iboe-${stamp}`,
          entityId: primaryEntity.id,
          entryNumber: `${primaryEntity.numbering?.journalPrefix || 'JE'}-${stamp}`,
          entryDate: issueDate,
          memo: 'Draft recognition entry for international bill of exchange presentment workflow.',
          debitAccount: '1106 Bills of Exchange Receivable',
          creditAccount: '2306 Draft Exchange Obligation',
          amount,
          status: 'draft',
          source: 'system',
          linkedDocumentIds: [documentId],
          verificationRequired: true,
        },
        ...prev.journalEntries,
      ],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBondExecutionPacket = async () => {
    if (!primaryEntity) {
      return;
    }

    const stamp = Date.now();
    const issueDate = new Date().toISOString().slice(0, 10);
    const maturityDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const nextReviewDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const entityLabel = primaryEntity.displayName || primaryEntity.name;
    const entityCode = buildEntityCode(entityLabel);
    const currency = primaryEntity.operationalDefaults?.baseCurrency || 'USD';
    const amount = 50000;
    const couponRate = 6.25;
    const legalIdentifier = `${entityCode}-PBOND-${issueDate.replace(/-/g, '')}-${String(stamp).slice(-4)}`;
    const instrumentId = `ins-bond-${stamp}`;
    const obligationId = `obl-bond-${stamp}`;
    const settlementId = `iset-bond-${stamp}`;
    const registerId = `reg-bond-${stamp}`;
    const holderEntryId = `hle-bond-${stamp}`;
    const documentId = `doc-bond-${stamp}`;
    const journalId = `je-bond-${stamp}`;
    const transactionId = `txn-bond-${stamp}`;

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'instrument',
      subjectId: instrumentId,
      label: 'Private Bond Execution Verification Token',
      proofReference:
        'Issued when a private bond execution packet is generated with register, holder-ledger, and discharge-control support.',
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${entityLabel} bond execution and registration review`,
      category: 'risk',
      dueDate: nextReviewDate,
      notes:
        'Confirm issue terms, holder posture, reserve support, governing documents, and whether the bond should be routed into presentment, remittance, or controlled discharge workflow.',
      linkedDocumentIds: [documentId],
    });

    const instrument: InstrumentRecord = {
      id: instrumentId,
      entityId: primaryEntity.id,
      title: `Private Bond Execution ${issueDate}`,
      instrumentType: 'private_bond',
      legalIdentifier,
      sourceClass: 'bond',
      marketSector: 'private',
      identifierCode: `${entityCode}-PBOND`,
      issuerName: entityLabel,
      issuerEntityId: primaryEntity.id,
      issueDate,
      maturityDate,
      denominationValue: amount,
      couponRate,
      paymentMedium: 'mixed_contractual_tender',
      obligationType: 'reserve_backed_claim',
      reserveDepositEnabled: true,
      performanceSecurityStatus: 'posted',
      linkedTokenIds: [token.id],
      linkedDocumentIds: [documentId],
      notes:
        'Studio-generated private bond execution record with registered-instrument, holder-ledger, and obligation-discharge control support.',
    };

    const obligation: ObligationRecord = {
      id: obligationId,
      entityId: primaryEntity.id,
      title: `Private Bond Obligation ${issueDate}`,
      legalIdentifier,
      obligationType: 'reserve_backed_claim',
      amount,
      paymentMedium: 'mixed_contractual_tender',
      status: 'open',
      linkedInstrumentIds: [instrumentId],
      linkedDocumentIds: [documentId],
      gainOrLossOnDischarge: 0,
      lifecycleStage: 'recognized',
      recurringSchedule: {
        enabled: true,
        frequency: 'monthly',
        interval: 1,
        nextDueDate: nextReviewDate,
        autoCreatePresentment: false,
        note: 'Review coupon, remittance, or negotiated discharge posture monthly until performed or retired.',
      },
      enforcementMemo:
        'Bond execution is registered internally with holder-ledger and discharge controls. External effectiveness, investor treatment, and governing-law implications still depend on the actual issue documents and review.',
    };

    const registerRecord: NegotiableInstrumentRegisterRecord = {
      id: registerId,
      entityId: primaryEntity.id,
      instrumentId,
      obligationId,
      legalIdentifier,
      registerLabel: `${entityLabel} Private Bond Register`,
      instrumentForm: 'bond',
      status: 'issued',
      issueDate,
      maturityDate,
      issuerEntityId: primaryEntity.id,
      currentHolderEntityId: primaryEntity.id,
      currentHolderLabel: entityLabel,
      faceAmount: amount,
      outstandingAmount: amount,
      currency,
      linkedDocumentIds: [documentId],
      linkedTokenIds: [token.id],
      notes:
        'Registered internally from AI Studio so the bond starts with a controlled identifier, holder, and outstanding balance.',
    };

    const holderEntry: HolderLedgerEntryRecord = {
      id: holderEntryId,
      entityId: primaryEntity.id,
      registerId,
      entryDate: issueDate,
      entryType: 'issue',
      holderEntityId: primaryEntity.id,
      holderLabel: entityLabel,
      amount,
      currency,
      resultingBalance: amount,
      linkedInstrumentId: instrumentId,
      linkedObligationId: obligationId,
      linkedDocumentIds: [documentId],
      linkedTokenIds: [token.id],
      notes: 'Initial holder-ledger issue entry created from the bond execution packet.',
    };

    const instrumentSettlement: InstrumentSettlementRecord = {
      id: settlementId,
      entityId: primaryEntity.id,
      title: `Bond Performance & Discharge Control ${issueDate}`,
      legalIdentifier,
      instrumentId,
      obligationId,
      linkedDocumentIds: [documentId],
      linkedTokenIds: [token.id],
      dischargeMethod: 'instrument_performance',
      recognitionBasis: 'obligation_recognized_before_cash',
      performanceStatus: 'issued',
      faceAmount: amount,
      performedAmount: 0,
      currency,
      effectiveDate: issueDate,
      dueDate: maturityDate,
      sourceDepositStatus: 'not_deposited',
      notes:
        'Use presentment, remittance, settlement, or posted performance evidence to move this bond from issued to performed and ultimately discharge the linked obligation.',
    };

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${entityLabel} Private Bond Execution Packet`,
      category: 'financial',
      summary:
        'Execution packet for a private bond with registered-instrument, holder-ledger, and obligation-discharge controls already opened.',
      retentionClass: 'financial_evidence',
      body: `# Private Bond Execution Packet

Entity: ${entityLabel}
Issue Date: ${issueDate}
Maturity Date: ${maturityDate}
Bond Identifier: ${legalIdentifier}

## Bond Terms
- Issuer: ${entityLabel}
- Holder / Registered Owner: ${entityLabel}
- Face Amount: ${amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${currency}
- Coupon: ${couponRate.toFixed(2)}%
- Form: Private bond / controlled instrument

## Registered Instrument Flow
- Instrument record opened in the ledger.
- Negotiable-instrument register entry opened with issued status.
- Holder ledger opened with the initial issue balance.
- Obligation and performance / discharge control records opened together.

## Directional Discharge Flow
1. Execute and retain the bond packet with the governing terms.
2. If value, reserve, or other performance is actually deposited or presented, record it through Accounting or Transactions.
3. Use presentment, remittance, settlement, and holder-ledger evidence to move the linked obligation toward discharge.
4. Do not mark the bond or obligation discharged until performance is posted and the control chain ties out.

## Operator Controls
- Confirm the holder, consideration, reserve support, and governing terms before external use.
- If this bond will support another entity obligation, link the related remittance or presentment records before claiming performance.
- Treat this as a controlled internal registration and evidence packet, not automatic external registration or legal approval.
`,
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      id: documentId,
      linkedInstrumentIds: [instrumentId],
      linkedTokenIds: [token.id],
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      instruments: [instrument, ...prev.instruments],
      obligations: [obligation, ...prev.obligations],
      negotiableInstrumentRegisters: [registerRecord, ...prev.negotiableInstrumentRegisters],
      holderLedgerEntries: [holderEntry, ...prev.holderLedgerEntries],
      instrumentSettlements: [instrumentSettlement, ...prev.instrumentSettlements],
      documents: [persistedDocument, ...prev.documents],
      tokens: [token, ...prev.tokens],
      complianceTags: [complianceTag, ...prev.complianceTags],
      transactions: [
        {
          id: transactionId,
          entityId: primaryEntity.id,
          type: 'journal',
          title: `${entityLabel} bond recognition draft`,
          amount,
          currency,
          date: issueDate,
          status: 'draft',
          linkedDocumentIds: [documentId],
          linkedPaymentIds: [],
          linkedJournalEntryIds: [journalId],
          linkedTokenIds: [token.id],
          notes:
            'Draft journal-side transaction created from the private bond execution packet.',
        },
        ...prev.transactions,
      ],
      journalEntries: [
        {
          id: journalId,
          entityId: primaryEntity.id,
          entryNumber: `${primaryEntity.numbering?.journalPrefix || 'JE'}-${stamp}`,
          entryDate: issueDate,
          memo: 'Draft recognition entry for private bond execution workflow.',
          debitAccount: '1115 Bond Reserve Receivable',
          creditAccount: '2320 Bond Obligation Outstanding',
          amount,
          status: 'draft',
          source: 'system',
          linkedTransactionIds: [transactionId],
          linkedDocumentIds: [documentId],
          verificationRequired: true,
        },
        ...prev.journalEntries,
      ],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBillExchangeAcceptanceCertificate = async () => {
    if (!primaryEntity) {
      return;
    }

    const targetInstrument = data.instruments.find(
      (item) =>
        item.entityId === primaryEntity.id && item.instrumentType === 'bill_of_exchange'
    );
    const linkedObligation = targetInstrument
      ? data.obligations.find((item) => item.linkedInstrumentIds?.includes(targetInstrument.id))
      : undefined;
    const linkedRegister = targetInstrument
      ? data.negotiableInstrumentRegisters.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const linkedPresentment = targetInstrument
      ? data.couponPresentments.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const issueDate = new Date().toISOString().slice(0, 10);
    const legalIdentifier =
      targetInstrument?.legalIdentifier ||
      linkedObligation?.legalIdentifier ||
      `${buildEntityCode(primaryEntity.displayName || primaryEntity.name)}-IBOE-PENDING`;

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Bill of Exchange Acceptance Certificate`,
      category: 'legal_memo',
      summary:
        'Acceptance certificate packet for an international bill of exchange, tied to presentment evidence, holder posture, and controlled settlement follow-through.',
      retentionClass: 'security_support',
      body: `# Bill of Exchange Acceptance Certificate

Entity: ${primaryEntity.displayName || primaryEntity.name}
Certificate Date: ${issueDate}
Instrument Reference: ${legalIdentifier}

## Instrument Context
- Bill of exchange title: ${targetInstrument?.title || 'To be inserted'}
- Drawer: ${targetInstrument?.issuerName || primaryEntity.displayName || primaryEntity.name}
- Drawee / Acceptor: ${targetInstrument?.counterpartyLabel || linkedPresentment?.receiverName || 'To be inserted'}
- Payee / Holder: ${linkedRegister?.currentHolderLabel || linkedPresentment?.receiverName || 'To be inserted'}
- Face amount: ${(targetInstrument?.denominationValue || linkedObligation?.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${primaryEntity.operationalDefaults?.baseCurrency || 'USD'}

## Acceptance Statement
The undersigned acknowledges acceptance of the referenced bill of exchange according to its stated tenor, subject to the instrument itself, any linked agreements, and any applicable governing law requirements.

## Presentment Evidence
- Presentment date: ${linkedPresentment?.presentmentDate || 'To be inserted'}
- Presentment reference: ${linkedPresentment?.couponReference || 'To be inserted'}
- Register label: ${linkedRegister?.registerLabel || 'To be inserted'}

## Operator Controls
- Confirm the drawee signature or other acceptance evidence is retained.
- Confirm the instrument register and holder ledger reflect acceptance posture.
- Do not treat this certificate as final discharge without actual performance and settlement evidence.
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} bill acceptance certificate review`,
      category: 'risk',
      dueDate: issueDate,
      notes:
        'Review acceptance evidence, register status, holder posture, and any governing-law requirements before relying on the acceptance certificate externally.',
      linkedDocumentIds: [document.id],
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedInstrumentIds: targetInstrument ? [targetInstrument.id] : undefined,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBillExchangeDishonorNotice = async () => {
    if (!primaryEntity) {
      return;
    }

    const targetInstrument = data.instruments.find(
      (item) =>
        item.entityId === primaryEntity.id && item.instrumentType === 'bill_of_exchange'
    );
    const linkedObligation = targetInstrument
      ? data.obligations.find((item) => item.linkedInstrumentIds?.includes(targetInstrument.id))
      : undefined;
    const linkedRegister = targetInstrument
      ? data.negotiableInstrumentRegisters.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const linkedPresentment = targetInstrument
      ? data.couponPresentments.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const issueDate = new Date().toISOString().slice(0, 10);
    const legalIdentifier =
      targetInstrument?.legalIdentifier ||
      linkedObligation?.legalIdentifier ||
      `${buildEntityCode(primaryEntity.displayName || primaryEntity.name)}-IBOE-PENDING`;

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Notice of Dishonor`,
      category: 'legal_memo',
      summary:
        'Dishonor notice packet for a bill of exchange with presentment, non-acceptance or non-payment, and next-step review fields.',
      retentionClass: 'security_support',
      body: `# Notice of Dishonor

Entity: ${primaryEntity.displayName || primaryEntity.name}
Notice Date: ${issueDate}
Instrument Reference: ${legalIdentifier}

## Instrument Context
- Bill of exchange title: ${targetInstrument?.title || 'To be inserted'}
- Drawer: ${targetInstrument?.issuerName || primaryEntity.displayName || primaryEntity.name}
- Drawee / Acceptor: ${targetInstrument?.counterpartyLabel || linkedPresentment?.receiverName || 'To be inserted'}
- Payee / Holder: ${linkedRegister?.currentHolderLabel || linkedPresentment?.receiverName || 'To be inserted'}
- Face amount: ${(targetInstrument?.denominationValue || linkedObligation?.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${primaryEntity.operationalDefaults?.baseCurrency || 'USD'}

## Dishonor Statement
Notice is given that the referenced bill of exchange was presented and was dishonored by non-acceptance, non-payment, or other exception requiring review.

## Presentment Record
- Presentment date: ${linkedPresentment?.presentmentDate || 'To be inserted'}
- Due date: ${linkedPresentment?.dueDate || targetInstrument?.maturityDate || 'To be inserted'}
- Presentment reference: ${linkedPresentment?.couponReference || 'To be inserted'}

## Operator Controls
- Confirm evidence of presentment and the dishonor event is retained.
- Update the register, holder ledger, and settlement exception posture.
- Review cure, protest, and notice timing before any outside enforcement step.
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} bill dishonor review`,
      category: 'risk',
      dueDate: issueDate,
      notes:
        'Review dishonor support, cure posture, protest rights, and governing-law requirements before any external enforcement action.',
      linkedDocumentIds: [document.id],
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedInstrumentIds: targetInstrument ? [targetInstrument.id] : undefined,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBillExchangeProtestCertificate = async () => {
    if (!primaryEntity) {
      return;
    }

    const targetInstrument = data.instruments.find(
      (item) =>
        item.entityId === primaryEntity.id && item.instrumentType === 'bill_of_exchange'
    );
    const linkedObligation = targetInstrument
      ? data.obligations.find((item) => item.linkedInstrumentIds?.includes(targetInstrument.id))
      : undefined;
    const linkedRegister = targetInstrument
      ? data.negotiableInstrumentRegisters.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const linkedPresentment = targetInstrument
      ? data.couponPresentments.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const issueDate = new Date().toISOString().slice(0, 10);
    const legalIdentifier =
      targetInstrument?.legalIdentifier ||
      linkedObligation?.legalIdentifier ||
      `${buildEntityCode(primaryEntity.displayName || primaryEntity.name)}-IBOE-PENDING`;

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Protest Certificate Packet`,
      category: 'legal_memo',
      summary:
        'Protest support packet for a bill of exchange, with presentment, dishonor, notice, and holder evidence fields for controlled review.',
      retentionClass: 'security_support',
      body: `# Protest Certificate Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}
Packet Date: ${issueDate}
Instrument Reference: ${legalIdentifier}

## Instrument Context
- Bill of exchange title: ${targetInstrument?.title || 'To be inserted'}
- Drawer: ${targetInstrument?.issuerName || primaryEntity.displayName || primaryEntity.name}
- Drawee / Acceptor: ${targetInstrument?.counterpartyLabel || linkedPresentment?.receiverName || 'To be inserted'}
- Holder: ${linkedRegister?.currentHolderLabel || linkedPresentment?.receiverName || 'To be inserted'}

## Protest Support
- Presentment date: ${linkedPresentment?.presentmentDate || 'To be inserted'}
- Dishonor date: ____________________
- Notice given to liable parties: ____________________
- Place of protest or formal record: ____________________

## Evidence Checklist
- Copy of the bill of exchange
- Evidence of presentment
- Evidence of dishonor or non-acceptance
- Notice log to indorsers or liable parties
- Register and holder-ledger tie-out

## Operator Controls
- Confirm whether protest is actually required or useful under the governing law.
- Confirm notice timing and evidentiary requirements with counsel before outside use.
- Preserve this as a controlled support packet, not a standalone guarantee of enforceability.
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} bill protest packet review`,
      category: 'risk',
      dueDate: issueDate,
      notes:
        'Review protest evidence, notice timing, and governing-law requirements before using the protest packet outside the controlled ledger workflow.',
      linkedDocumentIds: [document.id],
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedInstrumentIds: targetInstrument ? [targetInstrument.id] : undefined,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
    }));
    focusDocument(persistedDocument.id);
  };

  const getCurrentBillExchangeContext = () => {
    if (!primaryEntity) {
      return null;
    }

    const targetInstrument = data.instruments.find(
      (item) => item.entityId === primaryEntity.id && item.instrumentType === 'bill_of_exchange'
    );
    const linkedObligation = targetInstrument
      ? data.obligations.find((item) => item.linkedInstrumentIds?.includes(targetInstrument.id))
      : undefined;
    const linkedRegister = targetInstrument
      ? data.negotiableInstrumentRegisters.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const linkedPresentment = targetInstrument
      ? data.couponPresentments.find(
          (item) =>
            item.instrumentId === targetInstrument.id || item.obligationId === linkedObligation?.id
        )
      : undefined;
    const latestDispatch = targetInstrument
      ? [...data.dispatchRecords]
          .filter(
            (item) =>
              item.linkedInstrumentId === targetInstrument.id ||
              item.linkedObligationId === linkedObligation?.id
          )
          .sort((a, b) => `${b.dispatchDate}|${b.respondedAt || ''}`.localeCompare(`${a.dispatchDate}|${a.respondedAt || ''}`))[0]
      : undefined;
    const returnedEvidenceDocument = latestDispatch?.returnedEvidenceDocumentId
      ? data.documents.find((item) => item.id === latestDispatch.returnedEvidenceDocumentId)
      : undefined;

    return {
      targetInstrument,
      linkedObligation,
      linkedRegister,
      linkedPresentment,
      latestDispatch,
      returnedEvidenceDocument,
    };
  };

  const launchBillExchangeServiceAffidavit = async () => {
    const context = getCurrentBillExchangeContext();
    if (!primaryEntity || !context) {
      return;
    }

    const {
      targetInstrument,
      linkedObligation,
      linkedRegister,
      linkedPresentment,
      latestDispatch,
      returnedEvidenceDocument,
    } = context;
    const issueDate = new Date().toISOString().slice(0, 10);
    const legalIdentifier =
      targetInstrument?.legalIdentifier ||
      linkedObligation?.legalIdentifier ||
      `${buildEntityCode(primaryEntity.displayName || primaryEntity.name)}-IBOE-PENDING`;
    const dispatchMethod = formatDispatchMethod(latestDispatch?.method);
    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Service Affidavit`,
      category: 'legal_memo',
      summary:
        'Affidavit-style service record tied to the active bill of exchange dispatch, delivery method, proof seal, and returned evidence posture.',
      retentionClass: 'security_support',
      storageOwner: 'clearflow_retained',
      body: `# Service Affidavit\n\nEntity: ${primaryEntity.displayName || primaryEntity.name}\nAffidavit Date: ${issueDate}\nInstrument Reference: ${legalIdentifier}\n\n## Dispatch Record\n- Dispatch title: ${latestDispatch?.title || 'No dispatch record found'}\n- Dispatch method: ${dispatchMethod}\n- Dispatch date: ${latestDispatch?.dispatchDate || 'To be inserted'}\n- Recipient: ${latestDispatch?.recipientLabel || targetInstrument?.counterpartyLabel || 'To be inserted'}\n- Governing law / venue: ${latestDispatch?.governingLawLabel || 'To be inserted'} / ${latestDispatch?.governingVenueLabel || 'To be inserted'}\n\n## Proof & Original Control\n- Proof seal code: ${latestDispatch?.proofSealCode || primaryEntity.branding?.entityProofSealCode || 'To be inserted'}\n- Mailing line: ${latestDispatch?.mailingLine || primaryEntity.branding?.entityMailingLine || 'To be inserted'}\n- Original control posture: ${latestDispatch?.originalControlStatus || 'To be inserted'}\n- Service evidence posture: ${latestDispatch?.serviceEvidenceStatus || 'To be inserted'}\n- Returned evidence record: ${returnedEvidenceDocument?.title || 'No returned evidence linked yet'}\n\n## Affiant Statement\nThe undersigned affiant states that the referenced bill of exchange or related acceptance packet was dispatched using the method shown above and that the retained proof references, mailing identity, and supporting records are maintained in the ordinary control environment of ClearFlow and the issuing entity.\n\n## Operator Controls\n- Confirm the service details match the actual dispatch event and any mailing or courier receipt.\n- Confirm the returned evidence record is linked if a signed or executed copy has been received.\n- Do not rely on this affidavit alone as proof of legal effectiveness without actual governing-law review and supporting evidence.\n`,
    });

    const token = buildInternalToken({
      entityId: primaryEntity.id,
      subjectType: 'document',
      subjectId: document.id,
      label: 'Service Affidavit Proof Token',
      proofReference:
        latestDispatch?.proofSealCode ||
        latestDispatch?.mailingLine ||
        legalIdentifier,
    });
    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} service affidavit review`,
      category: 'risk',
      dueDate: latestDispatch?.protestDeadline || issueDate,
      notes:
        'Review service facts, proof references, returned evidence, and governing-law posture before relying on the affidavit outside the controlled ledger workflow.',
      linkedDocumentIds: [document.id],
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedInstrumentIds: targetInstrument ? [targetInstrument.id] : undefined,
      linkedComplianceTagIds: [complianceTag.id],
      linkedTokenIds: [token.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      tokens: [token, ...prev.tokens],
      complianceTags: [complianceTag, ...prev.complianceTags],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBillExchangeCertificateOfMailing = async () => {
    const context = getCurrentBillExchangeContext();
    if (!primaryEntity || !context) {
      return;
    }

    const {
      targetInstrument,
      linkedObligation,
      latestDispatch,
      returnedEvidenceDocument,
    } = context;
    const issueDate = new Date().toISOString().slice(0, 10);
    const legalIdentifier =
      targetInstrument?.legalIdentifier ||
      linkedObligation?.legalIdentifier ||
      `${buildEntityCode(primaryEntity.displayName || primaryEntity.name)}-IBOE-PENDING`;
    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Certificate of Mailing`,
      category: 'legal_memo',
      summary:
        'Certificate-style mailing proof for a bill of exchange or acceptance packet, tied to entity mailing identity and dispatch controls.',
      retentionClass: 'security_support',
      storageOwner: 'clearflow_retained',
      body: `# Certificate of Mailing\n\nEntity: ${primaryEntity.displayName || primaryEntity.name}\nCertificate Date: ${issueDate}\nInstrument Reference: ${legalIdentifier}\n\n## Mailing Record\n- Dispatch method: ${formatDispatchMethod(latestDispatch?.method)}\n- Dispatch date: ${latestDispatch?.dispatchDate || 'To be inserted'}\n- Recipient: ${latestDispatch?.recipientLabel || targetInstrument?.counterpartyLabel || 'To be inserted'}\n- Recipient email / route: ${latestDispatch?.recipientEmail || latestDispatch?.externalReference || 'To be inserted'}\n- Mailing line: ${latestDispatch?.mailingLine || primaryEntity.branding?.entityMailingLine || 'To be inserted'}\n- Proof seal code: ${latestDispatch?.proofSealCode || primaryEntity.branding?.entityProofSealCode || 'To be inserted'}\n- QR payload: ${latestDispatch?.qrPayload || primaryEntity.branding?.entityQrPayload || 'To be inserted'}\n\n## Delivery Support\n- Service evidence posture: ${latestDispatch?.serviceEvidenceStatus || 'To be inserted'}\n- Returned evidence record: ${returnedEvidenceDocument?.title || 'No returned evidence linked yet'}\n- Protest deadline: ${latestDispatch?.protestDeadline || 'To be inserted'}\n\n## Operator Controls\n- Attach actual mailing receipt, courier receipt, or equivalent delivery confirmation when available.\n- Confirm the mailing identity belongs to the issuing entity and was used on the outgoing original packet.\n- Do not treat the certificate of mailing as proof of acceptance or final enforceability by itself.\n`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} certificate of mailing review`,
      category: 'risk',
      dueDate: latestDispatch?.expectedResponseDate || issueDate,
      notes:
        'Review service method, mailing identity, receipt support, and protest timing before relying on postal or courier proof.',
      linkedDocumentIds: [document.id],
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedInstrumentIds: targetInstrument ? [targetInstrument.id] : undefined,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchBillExchangeCounselReviewMemo = async () => {
    const context = getCurrentBillExchangeContext();
    if (!primaryEntity || !context) {
      return;
    }

    const {
      targetInstrument,
      linkedObligation,
      linkedRegister,
      linkedPresentment,
      latestDispatch,
      returnedEvidenceDocument,
    } = context;
    const issueDate = new Date().toISOString().slice(0, 10);
    const legalIdentifier =
      targetInstrument?.legalIdentifier ||
      linkedObligation?.legalIdentifier ||
      `${buildEntityCode(primaryEntity.displayName || primaryEntity.name)}-IBOE-PENDING`;
    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Counsel Review Memo`,
      category: 'legal_memo',
      summary:
        'Review memo that frames the facts, governing-law posture, service evidence, and protest timing for counsel or legal-risk review.',
      retentionClass: 'security_support',
      storageOwner: 'clearflow_retained',
      body: `# Counsel Review Memo\n\nEntity: ${primaryEntity.displayName || primaryEntity.name}\nMemo Date: ${issueDate}\nInstrument Reference: ${legalIdentifier}\n\n## Facts To Review\n- Bill of exchange title: ${targetInstrument?.title || 'To be inserted'}\n- Drawer: ${targetInstrument?.issuerName || primaryEntity.displayName || primaryEntity.name}\n- Drawee / Acceptor: ${targetInstrument?.counterpartyLabel || linkedPresentment?.receiverName || 'To be inserted'}\n- Holder / Register: ${linkedRegister?.currentHolderLabel || 'To be inserted'}\n- Presentment date: ${linkedPresentment?.presentmentDate || latestDispatch?.dispatchDate || 'To be inserted'}\n- Response posture: ${latestDispatch?.acceptanceStatus || 'No response recorded'}\n\n## Service & Original Control\n- Dispatch method: ${formatDispatchMethod(latestDispatch?.method)}\n- Original control status: ${latestDispatch?.originalControlStatus || 'To be inserted'}\n- Service evidence status: ${latestDispatch?.serviceEvidenceStatus || 'To be inserted'}\n- Returned evidence: ${returnedEvidenceDocument?.title || 'No returned evidence linked yet'}\n- Proof seal / mailing line: ${latestDispatch?.proofSealCode || primaryEntity.branding?.entityProofSealCode || 'To be inserted'} / ${latestDispatch?.mailingLine || primaryEntity.branding?.entityMailingLine || 'To be inserted'}\n\n## Governing Posture\n- Governing law: ${latestDispatch?.governingLawLabel || primaryEntity.jurisdiction || primaryEntity.country || 'To be inserted'}\n- Governing venue: ${latestDispatch?.governingVenueLabel || primaryEntity.country || primaryEntity.jurisdiction || 'To be inserted'}\n- Protest or escalation review date: ${latestDispatch?.protestDeadline || 'To be inserted'}\n\n## Questions For Counsel\n- What law controls presentment, acceptance, dishonor, and protest for this instrument and parties?\n- Is protest required, useful, or unnecessary under the governing law and facts?\n- Does the current service evidence support outside enforcement or is more proof needed?\n- Is the retained original-control record sufficient, or is the original instrument still missing?\n\n## Operator Controls\n- Treat this as a review memo, not legal advice or a determination of enforceability.\n- Update the dispatch, returned evidence, and dishonor / acceptance records after counsel review.\n`,
    });

    const complianceTag = buildComplianceTag({
      entityId: primaryEntity.id,
      label: `${primaryEntity.displayName || primaryEntity.name} counsel review memo`,
      category: 'risk',
      dueDate: latestDispatch?.protestDeadline || issueDate,
      notes:
        'Use this memo to organize facts and open issues for counsel. It does not itself determine enforceability.',
      linkedDocumentIds: [document.id],
    });

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedInstrumentIds: targetInstrument ? [targetInstrument.id] : undefined,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
      dispatchRecords: prev.dispatchRecords.map((item) =>
        item.id === latestDispatch?.id
          ? {
              ...item,
              counselReviewStatus: 'recommended',
              linkedDocumentIds: [...(item.linkedDocumentIds || []), persistedDocument.id],
            }
          : item
      ),
    }));
    focusDocument(persistedDocument.id);
  };

  const launchSettlementRailAuditReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityRailControls = remittanceRailControls.filter((item) => {
      const payment = paymentsById.get(item.paymentId);
      return payment?.entityId === reportEntity.id && isOnOrAfterWindow(payment.paymentDate, reportWindow);
    });
    const blockedControls = entityRailControls.filter((item) => item.overallStatus === 'hold');
    const exceptionControls = entityRailControls.filter((item) => item.overallStatus === 'exception');
    const watchControls = entityRailControls.filter((item) => item.overallStatus === 'watch');
    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Settlement Rail Audit Report`,
      category: 'financial',
      summary:
        'Audit report across source control, proof posture, movement identifiers, return exposure, and reconciliation follow-up.',
      retentionClass: 'financial_evidence',
      body: `# Settlement Rail Audit Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Rail Posture Summary
- Ready rails: ${entityRailControls.filter((item) => item.overallStatus === 'ready').length}
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
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} settlement rail audit review`,
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
    if (!reportEntity) {
      return;
    }

    const entityTreasuries = data.treasuryAccounts.filter((item) => item.entityId === reportEntity.id);
    const entityBankAccounts = data.bankAccounts.filter((item) => item.entityId === reportEntity.id);
    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Treasury & Reserve Report`,
      category: 'financial',
      summary:
        'Treasury and reserve report covering available balances, remittance posture, linked banking, and reserve-backed settlements.',
      retentionClass: 'financial_evidence',
      body: `# Treasury & Reserve Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

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
  .filter(
    (item) =>
      item.entityId === reportEntity.id &&
      item.reserveBacked &&
      isOnOrAfterWindow(item.actualSettlementDate || item.initiatedAt, reportWindow),
  )
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
    if (!reportEntity) {
      return;
    }

    const reconciliationExceptions = data.reconciliations.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        isOnOrAfterWindow(item.periodEnd, reportWindow) &&
        (item.status !== 'completed' || item.statementReviewStatus === 'needs_review'),
    );
    const filingExceptions = data.taxReportingLinks.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        (item.status !== 'accepted' || item.tinMatchStatus === 'pending' || item.correctionStatus === 'pending'),
    );
    const returnExceptions = data.returnEvents.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        isOnOrAfterWindow(item.eventDate, reportWindow) &&
        item.status !== 'resolved',
    );
    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Operations Exception Report`,
      category: 'compliance',
      summary:
        'Exception report across reconciliation, returns, rail posture, and filing readiness for operator follow-up.',
      retentionClass: 'compliance',
      body: `# Operations Exception Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

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
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} operations exception review`,
      category: 'reporting',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio operations exception reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchTransactionProofAuditReport = () => {
    if (!reportEntity) {
      return;
    }

    const scopedProofChains = transactionProofChains.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.date, reportWindow),
    );
    const sealedChains = scopedProofChains.filter((item) => item.verificationStatus === 'sealed');
    const watchChains = scopedProofChains.filter((item) => item.verificationStatus !== 'sealed');
    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Transaction Proof Chain Audit`,
      category: 'tx_audit_packet',
      summary:
        'Encrypted transaction proof-chain audit covering movement links, settlement references, identifiers, and verification token coverage.',
      retentionClass: 'financial_evidence',
      body: `# Transaction Proof Chain Audit

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Chain Posture Summary
- Total chains: ${scopedProofChains.length}
- Sealed chains: ${sealedChains.length}
- Watch chains: ${watchChains.length}

## Watch Chains
${watchChains
  .slice(0, 10)
  .map(
    (item) =>
      `- ${item.title} | ${item.transactionId} | settlement ${item.settlementId || 'missing'} | payments ${item.paymentIds.length} | identifiers ${item.movementIdentifierIds.length} | tokens ${item.tokenIds.length} | reasons ${item.watchReasons.join(', ')}`,
  )
  .join('\n') || '- No proof-chain watch items were open at report time.'}

## Sealed Chains
${sealedChains
  .slice(0, 10)
  .map(
    (item) =>
      `- ${item.title} | ${item.transactionId} | previous ${item.previousChainId || 'origin'} | tokens ${item.tokenIds.join(', ') || 'none'}`,
  )
  .join('\n') || '- No sealed chains were in scope.'}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} proof chain audit review`,
      category: 'risk',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio transaction proof-chain audit reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchTaxAndPayrollSummaryReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityEmployees = data.employees.filter((item) => item.entityId === reportEntity.id);
    const entityDirectDeposits = data.directDepositAuthorizations.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        isOnOrAfterWindow(item.returnedAt || item.verifiedAt || item.requestedAt, reportWindow),
    );
    const entityReceipts = data.receipts.filter(
      (item) =>
        item.entityId === reportEntity.id && isOnOrAfterWindow(item.receiptDate, reportWindow),
    );
    const entityExpenses = data.expenses.filter(
      (item) =>
        item.entityId === reportEntity.id && isOnOrAfterWindow(item.expenseDate, reportWindow),
    );
    const filingLinks = data.taxReportingLinks.filter((item) => item.entityId === reportEntity.id);
    const contractorCount = entityEmployees.filter((item) => item.employeeType === 'contractor').length;
    const payrollBase = entityEmployees.reduce(
      (sum, employee) => sum + (employee.annualSalary || 0),
      0,
    );
    const receiptTotal = entityReceipts.reduce((sum, receipt) => sum + receipt.totalAmount, 0);
    const expenseTotal = entityExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Tax & Payroll Summary Report`,
      category: 'tax',
      summary:
        'Tax and payroll summary across employee base, direct deposit posture, receipts, expenses, and filing-review activity.',
      retentionClass: 'tax',
      body: `# Tax & Payroll Summary Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Workforce Summary
- Active workforce records: ${entityEmployees.length}
- Contractor records: ${contractorCount}
- Annualized payroll base: ${payrollBase.toLocaleString()}

## Direct Deposit Posture
- Sent / pending authorizations: ${entityDirectDeposits.filter((item) => item.status === 'sent' || item.status === 'draft').length}
- Returned forms: ${entityDirectDeposits.filter((item) => item.status === 'returned').length}
- Verified deposit instructions: ${entityDirectDeposits.filter((item) => item.status === 'verified').length}

## Tax Intake and Filing
- Open filing links: ${filingLinks.filter((item) => item.status !== 'accepted').length}
- Pending TIN reviews: ${filingLinks.filter((item) => item.tinMatchStatus === 'pending' || item.tinMatchStatus === 'not_checked').length}
- Corrective filing items: ${filingLinks.filter((item) => item.correctionStatus !== 'none').length}

## Operating Totals
- Receipt total: ${receiptTotal.toLocaleString()}
- Expense total: ${expenseTotal.toLocaleString()}
- Net operating difference: ${(receiptTotal - expenseTotal).toLocaleString()}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} tax and payroll review`,
      category: 'tax',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio tax and payroll summary reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchTaxFormCoverageReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityTaxDocuments = data.documents.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        item.category === 'tax' &&
        isOnOrAfterWindow(item.date, reportWindow),
    );
    const filingLinks = data.taxReportingLinks.filter((item) => item.entityId === reportEntity.id);
    const entityEmployees = data.employees.filter((item) => item.entityId === reportEntity.id);
    const contractorCount = entityEmployees.filter((item) => item.employeeType === 'contractor').length;
    const employeeCount = entityEmployees.filter((item) => item.employeeType !== 'contractor').length;
    const readyForms = filingLinks.filter((item) => item.status === 'accepted' || item.status === 'filed').length;
    const pendingForms = filingLinks.filter((item) => item.status === 'draft').length;
    const tinReviewItems = filingLinks.filter(
      (item) => item.tinMatchStatus === 'pending' || item.tinMatchStatus === 'not_checked',
    ).length;
    const correctiveItems = filingLinks.filter((item) => item.correctionStatus !== 'none').length;

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Tax Form Coverage Report`,
      category: 'tax',
      summary:
        'Coverage report across generated tax packets, active filing links, payroll forms, contractor reporting, and open tax-form gaps.',
      retentionClass: 'tax',
      body: `# Tax Form Coverage Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Form Coverage Snapshot
- Tax packets generated in scope: ${entityTaxDocuments.length}
- Active filing links: ${filingLinks.length}
- Filing links ready or completed: ${readyForms}
- Filing links still in draft: ${pendingForms}
- TIN review items still open: ${tinReviewItems}
- Correction items still open: ${correctiveItems}

## Workforce / Payee Exposure
- Employee records in scope: ${employeeCount}
- Contractor records in scope: ${contractorCount}
- W-2 / payroll posture needed: ${employeeCount > 0 ? 'yes' : 'no'}
- 1099 / payee intake posture needed: ${contractorCount > 0 ? 'yes' : 'no'}

## Packet Coverage
${entityTaxDocuments.map((item) => `- ${item.title} | ${item.status} | ${item.date}`).join('\n') || '- No tax packets are currently in scope.'}

## Operator Follow-Through
- Generate or refresh W-9 / W-8 intake where payee tax posture is still incomplete.
- Reconcile payroll and contractor records against filing links before annual close.
- Retain signed forms, filing proof, and correction evidence inside tax records.
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} tax form coverage review`,
      category: 'tax',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio to review tax packet coverage and open filing gaps.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchEftpsControlReport = () => {
    if (!reportEntity) {
      return;
    }

    const settings = data.workspaceSettings;
    const taxLinks = data.taxReportingLinks.filter((item) => item.entityId === reportEntity.id);
    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} EFTPS Control Report`,
      category: 'tax',
      summary:
        'Scoped EFTPS control report covering enrollment posture, deposit mode, filing links, and retained evidence expectations.',
      retentionClass: 'tax',
      body: `# EFTPS Control Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## EFTPS Profile
- Enabled in workspace: ${settings.eftpsEnabled ? 'yes' : 'no'}
- Enrollment status: ${settings.eftpsEnrollmentStatus?.replace(/_/g, ' ') || 'not started'}
- EIN on record: ${settings.eftpsEin || 'not set'}
- Operator: ${settings.eftpsOperatorName || 'not set'}
- Deposit mode: ${settings.eftpsDepositMode?.replace(/_/g, ' ') || 'not set'}
- Last evidence date: ${settings.eftpsLastEvidenceDate || 'not recorded'}

## Filing / Deposit Context
- Tax reporting links for entity: ${taxLinks.length}
- Filing links still open: ${taxLinks.filter((item) => item.status !== 'accepted').length}
- TIN review items still open: ${taxLinks.filter((item) => item.tinMatchStatus === 'pending' || item.tinMatchStatus === 'not_checked').length}

## Operator Follow-Through
- Verify EFTPS enrollment and payment authority for the entity.
- Retain confirmation numbers and payment evidence in tax records.
- Reconcile EFTPS payment activity against payroll, estimated tax, or filing support.
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} EFTPS control review`,
      category: 'tax',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio for EFTPS enrollment, evidence, and tax-payment control review.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchUspsOperationsReport = () => {
    if (!reportEntity) {
      return;
    }

    const settings = data.workspaceSettings;
    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} USPS Operations Report`,
      category: 'compliance',
      summary:
        'Scoped USPS business operations report covering gateway status, permit identifiers, service profile, and mailing evidence posture.',
      body: `# USPS Operations Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## USPS Profile
- Gateway enabled: ${settings.uspsGatewayEnabled ? 'yes' : 'no'}
- Gateway status: ${settings.uspsGatewayStatus?.replace(/_/g, ' ') || 'not started'}
- CRID: ${settings.uspsCrid || 'not set'}
- Mailer ID: ${settings.uspsMailerId || 'not set'}
- Permit number: ${settings.uspsPermitNumber || 'not set'}
- Service profile: ${settings.uspsServiceProfile?.replace(/_/g, ' ') || 'not set'}
- Business Service Administrator: ${settings.uspsBusinessServiceAdmin || 'not set'}

## Operator Follow-Through
- Confirm Business Customer Gateway access and service enrollments.
- Retain permit, manifest, and acceptance evidence in the vault.
- Reconcile postage, mailing, and shipping activity into ERP/accounting.
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} USPS operations review`,
      category: 'reporting',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio for USPS gateway, permit, and mailing operations oversight.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchStorageRetentionAuditReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityDocuments = data.documents.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.date, reportWindow),
    );
    const userOwnedDocs = entityDocuments.filter((item) => item.storageOwner === 'user_owned');
    const retainedDocs = entityDocuments.filter((item) => item.storageOwner === 'clearflow_retained');
    const driveReadyDocs = userOwnedDocs.filter((item) => item.externalStorageStatus === 'ready');
    const driveRoutedDocs = userOwnedDocs.filter((item) => item.externalStorageStatus === 'routed');
    const driveErrorDocs = userOwnedDocs.filter((item) => item.externalStorageStatus === 'error');

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Storage & Retention Audit Report`,
      category: 'compliance',
      summary:
        'Audit report across user-owned storage routing, retained records, and document retention posture.',
      retentionClass: 'compliance',
      body: `# Storage & Retention Audit Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Document Ownership Split
- User-owned records: ${userOwnedDocs.length}
- ClearFlow-retained records: ${retainedDocs.length}
- Total in scope: ${entityDocuments.length}

## Google Drive Routing
- Ready to route: ${driveReadyDocs.length}
- Routed successfully: ${driveRoutedDocs.length}
- Routing errors: ${driveErrorDocs.length}

## Retention Classes
${['operational', 'authority', 'compliance', 'tax', 'financial_evidence']
  .map((retentionClass) => {
    const count = entityDocuments.filter((item) => item.retentionClass === retentionClass).length;
    return `- ${retentionClass.replace('_', ' ')}: ${count}`;
  })
  .join('\n')}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} storage and retention audit review`,
      category: 'reporting',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio storage and retention audit reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchCounterpartyExposureReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityCustomers = data.customers.filter((item) => item.entityId === reportEntity.id);
    const entityVendors = data.vendors.filter((item) => item.entityId === reportEntity.id);
    const scopedPayments = data.payments.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.paymentDate, reportWindow),
    );
    const outgoingVendorPayments = scopedPayments.filter(
      (item) => item.direction === 'outgoing' && item.counterpartyType === 'vendor',
    );
    const incomingCustomerPayments = scopedPayments.filter(
      (item) => item.direction === 'incoming' && item.counterpartyType === 'customer',
    );
    const unverifiedVendors = entityVendors.filter(
      (vendor) =>
        vendor.paymentInstructions?.verificationStatus !== 'verified' &&
        vendor.paymentInstructions?.verificationStatus !== 'routing_valid',
    );

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Counterparty Exposure Report`,
      category: 'financial',
      summary:
        'Counterparty exposure report across vendors, customers, payment volume, and instruction verification posture.',
      retentionClass: 'financial_evidence',
      body: `# Counterparty Exposure Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Counterparty Counts
- Active customers: ${entityCustomers.filter((item) => item.status === 'active').length}
- Active vendors: ${entityVendors.filter((item) => item.status === 'active').length}
- Vendors with unverified instructions: ${unverifiedVendors.length}

## Payment Flow
- Outgoing vendor payments: ${outgoingVendorPayments.length}
- Incoming customer payments: ${incomingCustomerPayments.length}
- Outgoing vendor total: ${outgoingVendorPayments.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
- Incoming customer total: ${incomingCustomerPayments.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}

## Highest-Risk Vendors
${unverifiedVendors
  .slice(0, 8)
  .map(
    (vendor) =>
      `- ${vendor.name} | verification ${vendor.paymentInstructions?.verificationStatus || 'unverified'} | rail ${vendor.paymentInstructions?.railPreference || 'not set'}`,
  )
  .join('\n') || '- No unverified vendor instructions are currently open.'}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} counterparty exposure review`,
      category: 'risk',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio counterparty exposure reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchEntityReadinessReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityDocuments = data.documents.filter((item) => item.entityId === reportEntity.id);
    const entityAuthority = data.authorityRecords.filter((item) => item.entityId === reportEntity.id);
    const entityBankAccounts = data.bankAccounts.filter((item) => item.entityId === reportEntity.id);
    const entityTreasuryAccounts = data.treasuryAccounts.filter((item) => item.entityId === reportEntity.id);
    const entityCompliance = data.complianceTags.filter((item) => item.entityId === reportEntity.id);
    const readinessChecklist = [
      {
        label: 'Legal or governing records',
        ready: entityDocuments.some((item) => item.category === 'governing'),
      },
      {
        label: 'Authority records',
        ready:
          entityAuthority.length > 0 ||
          entityDocuments.some((item) => item.category === 'authority_record'),
      },
      {
        label: 'Tax identification',
        ready: Boolean(reportEntity.taxId),
      },
      {
        label: 'Banking or treasury setup',
        ready: entityBankAccounts.length > 0 || entityTreasuryAccounts.length > 0,
      },
      {
        label: 'Compliance review trail',
        ready: entityCompliance.length > 0,
      },
    ];

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Entity Readiness Report`,
      category: 'authority_record',
      summary:
        'Readiness report for entity formation, authority, tax identity, banking posture, and control records.',
      retentionClass: 'authority',
      body: `# Entity Readiness Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}

## Readiness Checklist
${readinessChecklist
  .map((item) => `- ${item.label}: ${item.ready ? 'ready' : 'missing / needs follow-up'}`)
  .join('\n')}

## Operating Posture
- Bank accounts linked: ${entityBankAccounts.length}
- Treasury accounts linked: ${entityTreasuryAccounts.length}
- Authority records: ${entityAuthority.length}
- Compliance tags: ${entityCompliance.length}
- Vault documents: ${entityDocuments.length}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} readiness review`,
      category: 'authority',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio entity readiness reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchEvidenceGapReport = () => {
    if (!reportEntity) {
      return;
    }

    const entityDocuments = data.documents.filter(
      (item) => item.entityId === reportEntity.id && isOnOrAfterWindow(item.date, reportWindow),
    );
    const requiredCategories: Array<{ label: string; category: DocumentCategory }> = [
      { label: 'Governing packet', category: 'governing' },
      { label: 'Authority record', category: 'authority_record' },
      { label: 'Compliance packet', category: 'compliance' },
      { label: 'Tax packet', category: 'tax' },
      { label: 'Financial evidence', category: 'financial' },
    ];
    const missingCategories = requiredCategories.filter(
      (item) => !entityDocuments.some((document) => document.category === item.category),
    );
    const retainedWithoutProof = entityDocuments.filter(
      (item) =>
        item.storageOwner === 'clearflow_retained' &&
        (!item.linkedTokenIds || item.linkedTokenIds.length === 0),
    );
    const userOwnedUnrouted = entityDocuments.filter(
      (item) => item.storageOwner === 'user_owned' && item.externalStorageStatus !== 'routed',
    );

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Evidence Gap Report`,
      category: 'compliance',
      summary:
        'Evidence gap report for missing packets, unrouted user-owned files, and retained documents lacking proof linkage.',
      retentionClass: 'compliance',
      body: `# Evidence Gap Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Missing Packet Categories
${missingCategories
  .map((item) => `- ${item.label}`)
  .join('\n') || '- No core packet categories are currently missing in scope.'}

## Retained Records Missing Token Proof
${retainedWithoutProof
  .slice(0, 10)
  .map((item) => `- ${item.title} | ${item.retentionClass}`)
  .join('\n') || '- No retained records in scope are missing linked token proof.'}

## User-Owned Records Not Yet Routed
${userOwnedUnrouted
  .slice(0, 10)
  .map((item) => `- ${item.title} | ${item.externalStorageStatus || 'not_routed'}`)
  .join('\n') || '- No user-owned records in scope are waiting on routing.'}
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: reportEntity.id,
      label: `${reportEntity.displayName || reportEntity.name} evidence gap review`,
      category: 'reporting',
      linkedDocumentIds: [document.id],
      notes: 'Generated from AI Studio evidence gap reporting.',
    });

    void appendDocumentBundle({
      document: { ...document, linkedComplianceTagIds: [complianceTag.id] },
      complianceTags: [complianceTag],
    });
  };

  const launchMunicipalLiquidityReviewReport = () => {
    if (!reportEntity) {
      return;
    }

    const municipalAssets = data.assets.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        (item.marketSector === 'municipal' || item.category === 'security') &&
        isOnOrAfterWindow(item.maturityDate || item.lastLiquidityReviewDate, reportWindow),
    );
    const municipalInstruments = data.instruments.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        (item.marketSector === 'municipal' || item.sourceClass === 'bond') &&
        isOnOrAfterWindow(item.maturityDate || item.issueDate, reportWindow),
    );

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Municipal Liquidity Review`,
      category: 'financial',
      summary:
        'Municipal security and reserve-paper review covering issuer identifiers, coupon and maturity profile, tax treatment, and liquidity posture.',
      retentionClass: 'financial_evidence',
      body: `# Municipal Liquidity Review

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Marketable Municipal Assets
${municipalAssets
  .map(
    (item) =>
      `- ${item.name} | ${item.identifierCode || 'no identifier'} | ${item.issuerName || 'issuer not set'} | coupon ${item.couponRate || 0}% | maturity ${item.maturityDate || 'not set'} | liquidity ${item.liquidityProfile || 'not reviewed'} | tax ${item.taxTreatment || 'not set'}`,
  )
  .join('\n') || '- No municipal reserve assets are currently in scope.'}

## Municipal / Bond Instruments
${municipalInstruments
  .map(
    (item) =>
      `- ${item.title} | ${item.legalIdentifier || 'no legal id'} | ${item.identifierCode || 'no market id'} | ${item.issuerName || 'issuer not set'} | coupon ${item.couponRate || 0}% | maturity ${item.maturityDate || 'not set'} | liquidity ${item.liquidityProfile || 'not reviewed'} | tax ${item.taxTreatment || 'not set'}`,
  )
  .join('\n') || '- No municipal bond instruments are currently in scope.'}

## Operator Follow-Through
- Review issuer disclosure and continuing event support in MSRB EMMA.
- Maintain identifier, coupon, maturity, rating, and tax treatment fields on reserve paper.
- Revisit liquidity posture before using thinly traded holdings for treasury or reserve planning.
`,
    });

    void appendDocument(document);
  };

  const launchMunicipalSecurityIntakePacket = () => {
    if (!primaryEntity) {
      return;
    }

    const document = buildGeneratedDocument({
      entityId: primaryEntity.id,
      title: `${primaryEntity.displayName || primaryEntity.name} Municipal Security Intake Packet`,
      category: 'financial',
      summary:
        'Operator intake packet for municipal reserve paper, issuer identifiers, coupon and maturity profile, tax treatment, and liquidity review.',
      retentionClass: 'financial_evidence',
      body: `# Municipal Security Intake Packet

Entity: ${primaryEntity.displayName || primaryEntity.name}

## Required Capture
- Issuer name
- CUSIP / internal identifier / EMMA reference
- Coupon and maturity
- Credit rating
- Tax treatment
- Liquidity profile
- Reserve purpose and linked treasury account

## Search Surfaces
- MSRB EMMA for issuer and continuing disclosure
- OpenFIGI for identifier support
- Internal ClearFlow asset ledger for linked reserve and settlement use

## Operator Note
Use this intake packet when adding municipal or other marketable reserve paper into the asset ledger so the holding is searchable, reportable, and ready for liquidity review.
`,
    });

    void appendDocument(document);
  };

  const launchCusipEmmaIntakeWorkflow = async () => {
    const targetEntity = reportEntity || primaryEntity;
    if (!targetEntity) {
      return;
    }

    const subjectAsset =
      data.assets.find(
        (item) => item.entityId === targetEntity.id && item.marketSector === 'municipal',
      ) ||
      data.assets.find(
        (item) => item.entityId === targetEntity.id && item.category === 'security',
      );
    const subjectInstrument =
      data.instruments.find(
        (item) => item.entityId === targetEntity.id && item.marketSector === 'municipal',
      ) ||
      data.instruments.find(
        (item) => item.entityId === targetEntity.id && item.sourceClass === 'bond',
      );

    const issuerName =
      subjectAsset?.issuerName ||
      subjectInstrument?.issuerName ||
      targetEntity.displayName ||
      targetEntity.name;
    const identifierCode =
      subjectAsset?.identifierCode || subjectInstrument?.identifierCode || '';
    const emmaUrl = buildEmmaSearchUrl(identifierCode);

    const document = buildGeneratedDocument({
      entityId: targetEntity.id,
      title: `${targetEntity.displayName || targetEntity.name} CUSIP / EMMA Intake Packet`,
      category: 'financial',
      summary:
        'Municipal security intake packet covering issuer name, identifier support, EMMA review, event-watch setup, and reserve ledger mapping.',
      retentionClass: 'financial_evidence',
      body: `# CUSIP / EMMA Intake Packet

Entity: ${targetEntity.displayName || targetEntity.name}
Issuer: ${issuerName}
Identifier: ${identifierCode || 'to be assigned'}
EMMA: ${emmaUrl}

## Intake Capture
- Issuer / obligor
- CUSIP or internal identifier
- Coupon, maturity, and rating
- Tax treatment
- Liquidity posture
- Reserve account linkage
- Disclosure watch owner

## Follow-Through
- Search MSRB EMMA for continuing disclosures and event notices
- Record liquidity posture in the asset and instrument ledger
- Add any event notice into the municipal event-watch layer
`,
    });

    const complianceTag = buildComplianceTag({
      entityId: targetEntity.id,
      label: `${targetEntity.displayName || targetEntity.name} municipal intake review`,
      category: 'reporting',
      notes: 'Generated from the CUSIP / EMMA intake workflow.',
      linkedDocumentIds: [document.id],
    });

    const disclosureRecord = {
      id: `muni-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: targetEntity.id,
      assetId: subjectAsset?.id,
      instrumentId: subjectInstrument?.id,
      issuerName,
      identifierCode: identifierCode || undefined,
      emmaUrl,
      disclosureType: 'trade_liquidity_review' as const,
      disclosureDate: new Date().toISOString().slice(0, 10),
      status: 'review' as const,
      linkedDocumentIds: [document.id],
      notes:
        'Initial municipal identifier, EMMA, and liquidity review record created from AI Studio intake.',
    };

    const eventNoticeRecord = {
      id: `muni-notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: targetEntity.id,
      assetId: subjectAsset?.id,
      instrumentId: subjectInstrument?.id,
      issuerName,
      identifierCode: identifierCode || undefined,
      emmaUrl,
      eventType: 'other' as const,
      eventDate: new Date().toISOString().slice(0, 10),
      severity: 'info' as const,
      status: 'open' as const,
      linkedDocumentIds: [document.id],
      notes:
        'Municipal event-watch record opened so future EMMA notices and issuer updates can be tracked against this position.',
    };

    const persistedDocument = await persistGeneratedDocumentRecord({
      ...document,
      linkedComplianceTagIds: [complianceTag.id],
    });

    setData((prev) => ({
      ...prev,
      documents: [persistedDocument, ...prev.documents],
      complianceTags: [complianceTag, ...prev.complianceTags],
      municipalDisclosures: [disclosureRecord, ...prev.municipalDisclosures],
      municipalEventNotices: [eventNoticeRecord, ...prev.municipalEventNotices],
    }));
    focusDocument(persistedDocument.id);
  };

  const launchMunicipalDisclosureWatchReport = () => {
    if (!reportEntity) {
      return;
    }

    const disclosureRecords = data.municipalDisclosures.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        isOnOrAfterWindow(item.disclosureDate || item.filingDate, reportWindow),
    );
    const eventNotices = data.municipalEventNotices.filter(
      (item) =>
        item.entityId === reportEntity.id &&
        isOnOrAfterWindow(item.eventDate, reportWindow),
    );

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} Municipal Disclosure Watch`,
      category: 'compliance',
      summary:
        'Disclosure and event-watch report for municipal reserve paper, EMMA review, identifier support, and liquidity notices.',
      retentionClass: 'compliance',
      body: `# Municipal Disclosure Watch

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## Disclosure Records
${disclosureRecords
  .map(
    (item) =>
      `- ${item.issuerName} | ${item.identifierCode || 'no identifier'} | ${item.disclosureType} | ${item.status} | ${item.disclosureDate}`,
  )
  .join('\n') || '- No municipal disclosure records are currently in scope.'}

## Event Notices
${eventNotices
  .map(
    (item) =>
      `- ${item.issuerName} | ${item.identifierCode || 'no identifier'} | ${item.eventType} | ${item.severity} | ${item.status} | ${item.eventDate}`,
  )
  .join('\n') || '- No municipal event notices are currently in scope.'}

## Operator Follow-Through
- Review MSRB EMMA for fresh continuing disclosures and material events.
- Escalate any critical default, rating, or tax-opinion notices into compliance review.
- Revisit liquidity posture when event notices change trading or reserve usability.
`,
    });

    void appendDocument(document);
  };

  const launchAmlOversightReport = () => {
    if (!reportEntity) {
      return;
    }

    const scopedKyb = data.kybReviews.filter(
      (item) =>
        item.entityId === reportEntity.id && isOnOrAfterWindow(item.reviewDate, reportWindow),
    );
    const scopedScreenings = data.watchlistScreenings.filter(
      (item) =>
        item.entityId === reportEntity.id && isOnOrAfterWindow(item.screenedAt, reportWindow),
    );
    const scopedCases = data.amlCases.filter(
      (item) =>
        item.entityId === reportEntity.id && isOnOrAfterWindow(item.openedAt, reportWindow),
    );

    const document = buildGeneratedDocument({
      entityId: reportEntity.id,
      title: `${reportEntity.displayName || reportEntity.name} AML Oversight Report`,
      category: 'compliance',
      summary:
        'KYC/KYB, watchlist, and AML casework report for current operating and filing posture.',
      retentionClass: 'compliance',
      body: `# AML Oversight Report

Entity: ${reportEntity.displayName || reportEntity.name}
Date: ${new Date().toISOString().slice(0, 10)}
Scope Window: ${reportWindowLabel}

## KYC / KYB Reviews
${scopedKyb
  .map(
    (item) =>
      `- ${item.reviewType} | ${item.status} | coverage ${item.documentCoverage} | screening ${item.screeningStatus}`,
  )
  .join('\n') || '- No reviews are currently in scope.'}

## Watchlist Screenings
${scopedScreenings
  .map(
    (item) =>
      `- ${item.subjectLabel} | ${item.screeningScope} | ${item.status} | disposition ${item.disposition}`,
  )
  .join('\n') || '- No screening records are currently in scope.'}

## AML Cases
${scopedCases
  .map(
    (item) =>
      `- ${item.title} | ${item.caseType} | ${item.status} | ${item.filingPath || 'internal_only'} / ${item.filingStatus || 'not_started'}`,
  )
  .join('\n') || '- No AML cases are currently in scope.'}

## Operator Focus
- Clear pending watchlist dispositions before new bank-facing use.
- Refresh KYB and ownership support where document coverage is partial or missing.
- Escalate suspicious or currency cases into filing-prep review only when facts support it.
`,
    });

    void appendDocument(document);
  };

  const launchFullOperationsPack = () => {
    if (!reportEntity) {
      return;
    }

    launchSettlementRailAuditReport();
    launchTreasuryReserveReport();
    launchOperationsExceptionReport();
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
      title: 'Municipal Security Intake',
      subtitle: 'Reserve paper, EMMA, and liquidity capture',
      detail: 'Create an intake packet for municipal reserve holdings with issuer, identifier, tax, and liquidity fields ready for the asset ledger and broader security-master work.',
      lane: 'ledger',
      actionLabel: 'Create Intake Packet',
      onAction: launchMunicipalSecurityIntakePacket,
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
      title: 'International Bill of Exchange',
      subtitle: 'Draft, presentment, and acceptance packet',
      detail: 'Create a ledger-aware international bill of exchange packet with UCC-style draft elements, foreign-money review, presentment controls, and IRM caution notes.',
      lane: 'ledger',
      actionLabel: 'Draft Exchange',
      onAction: launchInternationalBillOfExchangePacket,
    },
    {
      title: 'Bond Execution & Registration',
      subtitle: 'Register, holder ledger, and discharge controls',
      detail: 'Create a private bond execution packet that lands directly in the instrument register, holder ledger, obligation controls, and performance / discharge workflow.',
      lane: 'ledger',
      actionLabel: 'Execute Bond',
      onAction: launchBondExecutionPacket,
    },
    {
      title: 'Acceptance Certificate',
      subtitle: 'Bill of exchange acceptance support',
      detail: 'Generate an acceptance certificate tied to the current bill of exchange, holder posture, and presentment evidence.',
      lane: 'ledger',
      actionLabel: 'Create Certificate',
      onAction: launchBillExchangeAcceptanceCertificate,
    },
    {
      title: 'Notice of Dishonor',
      subtitle: 'Non-acceptance or non-payment support',
      detail: 'Generate a dishonor notice packet tied to the current bill of exchange and presentment trail.',
      lane: 'ledger',
      actionLabel: 'Create Notice',
      onAction: launchBillExchangeDishonorNotice,
    },
    {
      title: 'Protest Certificate Packet',
      subtitle: 'Presentment and protest evidence support',
      detail: 'Generate a protest support packet with notice, evidence, and holder-ledger tie-out fields for the current bill of exchange.',
      lane: 'ledger',
      actionLabel: 'Create Protest Packet',
      onAction: launchBillExchangeProtestCertificate,
    },
    {
      title: 'Service Affidavit',
      subtitle: 'Dispatch facts and proof identity support',
      detail: 'Generate an affidavit-style service record from the active dispatch, mailing identity, and returned evidence posture.',
      lane: 'ledger',
      actionLabel: 'Create Affidavit',
      onAction: launchBillExchangeServiceAffidavit,
    },
    {
      title: 'Certificate of Mailing',
      subtitle: 'Mailing proof and service timing',
      detail: 'Generate a retained certificate of mailing tied to the entity mailing line, proof seal, dispatch method, and response window.',
      lane: 'ledger',
      actionLabel: 'Create Mailing Record',
      onAction: launchBillExchangeCertificateOfMailing,
    },
    {
      title: 'Counsel Review Memo',
      subtitle: 'Governing-law and protest issue memo',
      detail: 'Generate a counsel-review memo that frames governing law, service evidence, original control, and protest timing without overstating enforceability.',
      lane: 'ledger',
      actionLabel: 'Create Review Memo',
      onAction: launchBillExchangeCounselReviewMemo,
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
      title: 'Tax Form Generator',
      subtitle: 'W-9, W-8, W-2, 941, 940, and 1099 support',
      detail: 'Create a broader tax packet for payee intake, payroll filing, and information-return follow-through with linked compliance and reporting records.',
      lane: 'compliance',
      actionLabel: 'Create Tax Packet',
      onAction: launchTaxFormGeneratorPacket,
    },
    {
      title: 'EFTPS Operations Packet',
      subtitle: 'Treasury tax-payment enrollment and scheduling controls',
      detail: 'Create a setup packet for EFTPS enrollment, federal deposit scheduling, payment evidence, and Treasury control review.',
      lane: 'compliance',
      actionLabel: 'Create EFTPS Packet',
      onAction: launchEftpsOperationsPacket,
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
      title: 'KYC / KYB Refresh',
      subtitle: 'Entity refresh, ownership, and document coverage',
      detail: 'Open a refresh packet and review record for entity diligence, owner coverage, and next review scheduling.',
      lane: 'compliance',
      actionLabel: 'Create Refresh Packet',
      onAction: () => {
        void launchKybRefreshPacket();
      },
    },
    {
      title: 'Watchlist Review',
      subtitle: 'Sanctions, PEP, and adverse-media screening',
      detail: 'Create a screening packet and queue item for watchlist disposition before payment or banking use.',
      lane: 'compliance',
      actionLabel: 'Start Screening',
      onAction: () => {
        void launchWatchlistReviewPacket();
      },
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
      title: 'CUSIP / EMMA Intake',
      subtitle: 'Municipal identifier and disclosure-watch setup',
      detail: 'Create a municipal intake packet, disclosure review record, and event-watch starter so reserve paper is actually tracked in the system.',
      lane: 'compliance',
      actionLabel: 'Start Intake',
      onAction: () => {
        void launchCusipEmmaIntakeWorkflow();
      },
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
      title: 'AML Case Packet',
      subtitle: 'Investigation, SAR, and CTR prep support',
      detail: 'Open a case packet for suspicious activity, currency activity, watchlist escalation, and retention handling.',
      lane: 'compliance',
      actionLabel: 'Open Case Packet',
      onAction: () => {
        void launchAmlCasePacket();
      },
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
    {
      title: 'USPS Business Gateway Packet',
      subtitle: 'BCG, PostalOne, permit, and PDX/eVS setup',
      detail: 'Create a USPS operations packet for Business Customer Gateway access, permit controls, manifest handling, and parcel-data readiness.',
      lane: 'operations',
      actionLabel: 'Create USPS Packet',
      onAction: launchUspsBusinessGatewayPacket,
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
      detail: `${data.complianceTags.filter((item) => item.status === 'review').length} compliance reviews, ${data.watchlistScreenings.filter((item) => item.status !== 'clear' || item.disposition === 'pending_review').length} watchlist items, and ${data.amlCases.filter((item) => item.status !== 'closed').length} AML cases are in queue.`,
      actionLabel: 'Open Compliance',
      actionHash: '#compliance',
    },
    {
      title: 'EFTPS Tax Payments',
      subtitle: data.workspaceSettings.eftpsEnabled
        ? `Profile ${data.workspaceSettings.eftpsEnrollmentStatus?.replace(/_/g, ' ') || 'enabled'}`
        : 'EFTPS profile not enabled',
      detail: data.workspaceSettings.eftpsEnabled
        ? `Operator ${data.workspaceSettings.eftpsOperatorName || 'not set'}, treasury ${linkedEftpsTreasury?.name || 'not linked'}, bank ${linkedEftpsBank?.accountName || 'not linked'}, ledger ${linkedEftpsLedger ? `${linkedEftpsLedger.code} ${linkedEftpsLedger.name}` : 'not linked'}.`
        : 'Enable EFTPS in Settings to track tax-payment enrollment, operator, EIN, and retained payment evidence.',
      actionLabel: 'Open Settings',
      actionHash: '#settings',
    },
    {
      title: 'USPS Business Gateway',
      subtitle: data.workspaceSettings.uspsGatewayEnabled
        ? `Profile ${data.workspaceSettings.uspsGatewayStatus?.replace(/_/g, ' ') || 'enabled'}`
        : 'USPS gateway profile not enabled',
      detail: data.workspaceSettings.uspsGatewayEnabled
        ? `CRID ${data.workspaceSettings.uspsCrid || 'not set'}, MID ${data.workspaceSettings.uspsMailerId || 'not set'}, bank ${linkedUspsBank?.accountName || 'not linked'}, postage ledger ${linkedUspsPostageLedger ? `${linkedUspsPostageLedger.code} ${linkedUspsPostageLedger.name}` : 'not linked'}.`
        : 'Enable USPS Gateway in Settings to track CRID, MID, permit, and service enrollments.',
      actionLabel: 'Open Settings',
      actionHash: '#settings',
    },
  ];

  const taxFormTools = [
    {
      title: 'Broad Tax Packet',
      subtitle: 'W-9, W-8, W-2, 941, 940, and 1099 support',
      detail: 'Build a general tax-form generator packet for payee intake, payroll filing, and information-return follow-through.',
      actionLabel: 'Create Tax Packet',
      onAction: launchTaxFormGeneratorPacket,
    },
    {
      title: 'Payee Tax Intake',
      subtitle: 'W-9 and TIN support',
      detail: 'Open the payee-facing intake packet for tax certification, classification review, and 1099 queue setup.',
      actionLabel: 'Create W-9 Packet',
      onAction: launchW9CollectionPacket,
    },
    {
      title: '1099 Filing Prep',
      subtitle: 'IRIS / FIRE readiness',
      detail: 'Create a payer-side 1099 prep packet with evidence, vendor review, and filing controls.',
      actionLabel: 'Create 1099 Packet',
      onAction: launch1099PrepPacket,
    },
    {
      title: 'Coverage Review',
      subtitle: 'Packet and filing-gap visibility',
      detail: 'Generate a coverage report for tax packets, filing links, payroll form posture, and contractor reporting gaps.',
      actionLabel: 'Create Coverage Report',
      onAction: launchTaxFormCoverageReport,
    },
    {
      title: 'Tax Readiness Pack',
      subtitle: 'Generator plus summary and gap review',
      detail: 'Run the broader generator, tax coverage review, and tax/payroll summary together for the current report scope.',
      actionLabel: 'Generate Tax Pack',
      onAction: () => {
        launchTaxFormGeneratorPacket();
        launchTaxFormCoverageReport();
        launchTaxAndPayrollSummaryReport();
      },
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
    {
      title: 'Transaction Proof Chain Audit',
      subtitle: 'Encrypted movement and verification chain coverage',
      detail: 'Create a report across sealed transaction chains, watch chains, identifiers, and token proof coverage.',
      actionLabel: 'Create Proof Audit',
      onAction: launchTransactionProofAuditReport,
    },
    {
      title: 'Tax & Payroll Summary',
      subtitle: 'Employee, deposit, filing, receipt, and expense overview',
      detail: 'Create a tax and payroll report across workforce, direct deposit readiness, filing review, and operating totals.',
      actionLabel: 'Create Payroll Report',
      onAction: launchTaxAndPayrollSummaryReport,
    },
    {
      title: 'Tax Form Coverage Report',
      subtitle: 'Generated packets, filing links, and tax-form gaps',
      detail: 'Create a coverage report across generated tax packets, open filing links, contractor posture, and payroll form readiness.',
      actionLabel: 'Create Coverage Report',
      onAction: launchTaxFormCoverageReport,
    },
    {
      title: 'Storage & Retention Audit',
      subtitle: 'User-owned routing and retained-record posture',
      detail: 'Create a storage audit for Google Drive routing, retained records, and document retention coverage.',
      actionLabel: 'Create Storage Audit',
      onAction: launchStorageRetentionAuditReport,
    },
    {
      title: 'EFTPS Control Report',
      subtitle: 'Enrollment, evidence, and tax-payment posture',
      detail: 'Create a scoped EFTPS oversight report from the workspace integration profile and tax queue.',
      actionLabel: 'Create EFTPS Report',
      onAction: launchEftpsControlReport,
    },
    {
      title: 'USPS Operations Report',
      subtitle: 'Gateway, permit, and mailing evidence posture',
      detail: 'Create a USPS operations report from the workspace gateway profile and mailing setup posture.',
      actionLabel: 'Create USPS Report',
      onAction: launchUspsOperationsReport,
    },
    {
      title: 'Counterparty Exposure Report',
      subtitle: 'Vendor/customer posture and instruction risk',
      detail: 'Create a counterparty report across active vendors, customers, payment volume, and instruction verification.',
      actionLabel: 'Create Exposure Report',
      onAction: launchCounterpartyExposureReport,
    },
    {
      title: 'Entity Readiness Report',
      subtitle: 'Formation, authority, tax, and banking readiness',
      detail: 'Create a readiness report for legal records, authority coverage, tax identity, and banking posture.',
      actionLabel: 'Create Readiness Report',
      onAction: launchEntityReadinessReport,
    },
    {
      title: 'Evidence Gap Report',
      subtitle: 'Missing packets, unrouted files, and retained proof gaps',
      detail: 'Create an evidence gap report across missing categories, unrouted user-owned files, and retained proof coverage.',
      actionLabel: 'Create Gap Report',
      onAction: launchEvidenceGapReport,
    },
    {
      title: 'Municipal Liquidity Review',
      subtitle: 'Issuer, identifier, coupon, maturity, and liquidity posture',
      detail: 'Create a municipal reserve-paper report for issuer support, identifier tracking, coupon and maturity profile, and market-liquidity review.',
      actionLabel: 'Create Muni Review',
      onAction: launchMunicipalLiquidityReviewReport,
    },
    {
      title: 'Municipal Disclosure Watch',
      subtitle: 'EMMA follow-through and event-notice review',
      detail: 'Create a disclosure watch report across municipal issuer filings, identifier coverage, and event notices already tracked in the workspace.',
      actionLabel: 'Create Watch Report',
      onAction: launchMunicipalDisclosureWatchReport,
    },
    {
      title: 'AML Oversight Report',
      subtitle: 'KYC/KYB, screening, and casework posture',
      detail: 'Create a compliance report across diligence refresh work, watchlist screening, and AML case escalation posture.',
      actionLabel: 'Create AML Report',
      onAction: launchAmlOversightReport,
    },
  ];
  const reportPackPresets = [
    {
      title: 'Controller Close Pack',
      subtitle: 'Settlement, treasury, and exception coverage for close work',
      detail: 'Generate all three core reports together for the currently selected entity and reporting window.',
      actionLabel: 'Generate Full Ops Pack',
      onAction: launchFullOperationsPack,
    },
    {
      title: '90-Day Rail Review',
      subtitle: 'Focus on recent settlement blockers and watch items',
      detail: 'Switches the studio to the 90-day lens that works well for settlement and treasury review.',
      actionLabel: 'Use 90-Day Scope',
      onAction: () => setReportWindow('90d'),
    },
    {
      title: 'Annual Reporting View',
      subtitle: 'Longer-range filing and exception posture',
      detail: 'Shifts the report scope to the last 12 months for annual oversight and filing support.',
      actionLabel: 'Use Annual Scope',
      onAction: () => setReportWindow('365d'),
    },
    {
      title: 'Payroll & Filing Pack',
      subtitle: 'Payroll posture, tax intake, and storage review',
      detail: 'Generate the tax and payroll summary plus the storage and retention audit for the current scope.',
      actionLabel: 'Generate Payroll Pack',
      onAction: () => {
        launchTaxAndPayrollSummaryReport();
        launchStorageRetentionAuditReport();
      },
    },
    {
      title: 'EFTPS & USPS Ops Pack',
      subtitle: 'Treasury tax payments and mailing operations together',
      detail: 'Generate the EFTPS operations packet plus both EFTPS and USPS oversight reports for the current scope.',
      actionLabel: 'Generate Ops Pack',
      onAction: () => {
        launchEftpsOperationsPacket();
        launchEftpsControlReport();
        launchUspsOperationsReport();
      },
    },
    {
      title: 'Tax Form Readiness Pack',
      subtitle: 'Form generation, payroll summary, and coverage review',
      detail: 'Generate the broader tax form generator packet, the tax form coverage report, and the tax and payroll summary for the current scope.',
      actionLabel: 'Generate Tax Pack',
      onAction: () => {
        launchTaxFormGeneratorPacket();
        launchTaxFormCoverageReport();
        launchTaxAndPayrollSummaryReport();
      },
    },
    {
      title: 'Counterparty Review Pack',
      subtitle: 'Vendor/customer exposure and exception follow-through',
      detail: 'Generate the counterparty exposure report plus the operations exception report for the selected scope.',
      actionLabel: 'Generate Counterparty Pack',
      onAction: () => {
        launchCounterpartyExposureReport();
        launchOperationsExceptionReport();
      },
    },
    {
      title: 'Entity Launch Audit Pack',
      subtitle: 'Readiness and evidence-gap review for setup quality',
      detail: 'Generate the entity readiness report plus the evidence gap report for the selected scope.',
      actionLabel: 'Generate Launch Audit',
      onAction: () => {
        launchEntityReadinessReport();
        launchEvidenceGapReport();
      },
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
      ...data.assets.map((item) => ({
        id: `asset-${item.id}`,
        label: item.name,
        subtitle: `Asset | ${item.marketSector || item.category}`,
        haystack: `${item.name} ${item.identifierCode || ''} ${item.issuerName || ''} ${item.marketSector || ''} ${item.creditRating || ''} ${item.taxTreatment || ''} ${item.notes || ''}`,
        hash: '#assets',
      })),
      ...data.instruments.map((item) => ({
        id: `instrument-${item.id}`,
        label: item.title,
        subtitle: `Instrument | ${item.marketSector || item.sourceClass || item.instrumentType}`,
        haystack: `${item.title} ${item.legalIdentifier || ''} ${item.identifierCode || ''} ${item.issuerName || ''} ${item.marketSector || ''} ${item.creditRating || ''} ${item.taxTreatment || ''} ${item.notes || ''}`,
        hash: '#assets',
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
      ...data.treasuryAccounts.map((item) => ({
        id: `treasury-${item.id}`,
        label: item.name,
        subtitle: `Treasury | ${item.treasuryType} | ${item.status}`,
        haystack: `${item.name} ${item.treasuryType} ${item.status} ${item.originatingAuthority || ''}`,
        hash: '#ledger',
      })),
      ...data.bankAccounts.map((item) => ({
        id: `bank-${item.id}`,
        label: item.accountName,
        subtitle: `Bank account | ${item.institutionName} | ${item.liveFeedStatus || 'not_connected'}`,
        haystack: `${item.accountName} ${item.institutionName} ${item.connectionType || ''} ${item.liveFeedStatus || ''}`,
        hash: '#accounting:bankFeed',
      })),
      ...data.complianceTags.map((item) => ({
        id: `compliance-${item.id}`,
        label: item.label,
        subtitle: `Compliance | ${item.category} | ${item.status}`,
        haystack: `${item.label} ${item.category} ${item.status} ${item.notes || ''} ${item.jurisdiction || ''}`,
        hash: item.linkedDocumentIds?.[0] ? `#documents:${item.linkedDocumentIds[0]}` : '#compliance',
      })),
      ...data.municipalDisclosures.map((item) => ({
        id: `municipal-disclosure-${item.id}`,
        label: `${item.issuerName} disclosure`,
        subtitle: `Municipal disclosure | ${item.disclosureType} | ${item.status}`,
        haystack: `${item.issuerName} ${item.identifierCode || ''} ${item.disclosureType} ${item.status} ${item.notes || ''}`,
        hash: '#assets',
      })),
      ...data.municipalEventNotices.map((item) => ({
        id: `municipal-event-${item.id}`,
        label: `${item.issuerName} event notice`,
        subtitle: `Municipal event | ${item.eventType} | ${item.severity}`,
        haystack: `${item.issuerName} ${item.identifierCode || ''} ${item.eventType} ${item.severity} ${item.status} ${item.notes || ''}`,
        hash: '#assets',
      })),
      ...data.kybReviews.map((item) => ({
        id: `kyb-review-${item.id}`,
        label: `${item.reviewType.replace(/_/g, ' ')} review`,
        subtitle: `KYC/KYB | ${item.status} | ${item.documentCoverage}`,
        haystack: `${item.reviewType} ${item.status} ${item.documentCoverage} ${item.screeningStatus} ${item.notes || ''}`,
        hash: '#compliance',
      })),
      ...data.watchlistScreenings.map((item) => ({
        id: `watchlist-${item.id}`,
        label: `${item.subjectLabel} screening`,
        subtitle: `Watchlist | ${item.screeningScope} | ${item.status}`,
        haystack: `${item.subjectLabel} ${item.subjectType} ${item.screeningScope} ${item.status} ${item.disposition} ${item.notes || ''}`,
        hash: '#compliance',
      })),
      ...data.amlCases.map((item) => ({
        id: `aml-case-${item.id}`,
        label: item.title,
        subtitle: `AML case | ${item.caseType} | ${item.status}`,
        haystack: `${item.title} ${item.caseType} ${item.status} ${item.filingPath || ''} ${item.filingStatus || ''} ${item.notes || ''}`,
        hash: item.linkedDocumentIds?.[0] ? `#documents:${item.linkedDocumentIds[0]}` : '#compliance',
      })),
      ...integrationLaunchers.map((item) => ({
        id: `integration-${item.title}`,
        label: item.title,
        subtitle: `Integration | ${item.subtitle}`,
        haystack: `${item.title} ${item.subtitle} ${item.detail}`,
        hash: item.actionHash,
      })),
      {
        id: 'workspace-eftps-profile',
        label: 'EFTPS integration profile',
        subtitle: `Workspace settings | ${data.workspaceSettings.eftpsEnrollmentStatus?.replace(/_/g, ' ') || 'not started'}`,
        haystack: `EFTPS ${data.workspaceSettings.eftpsEin || ''} ${data.workspaceSettings.eftpsOperatorName || ''} ${data.workspaceSettings.eftpsDepositMode || ''} ${data.workspaceSettings.eftpsLastEvidenceDate || ''}`,
        hash: '#settings',
      },
      {
        id: 'workspace-usps-profile',
        label: 'USPS gateway profile',
        subtitle: `Workspace settings | ${data.workspaceSettings.uspsGatewayStatus?.replace(/_/g, ' ') || 'not started'}`,
        haystack: `USPS Business Customer Gateway ${data.workspaceSettings.uspsCrid || ''} ${data.workspaceSettings.uspsMailerId || ''} ${data.workspaceSettings.uspsPermitNumber || ''} ${data.workspaceSettings.uspsServiceProfile || ''} ${data.workspaceSettings.uspsBusinessServiceAdmin || ''}`,
        hash: '#settings',
      },
      ...reportPackPresets.map((item) => ({
        id: `report-pack-${item.title}`,
        label: item.title,
        subtitle: `Report pack | ${item.subtitle}`,
        haystack: `${item.title} ${item.subtitle} ${item.detail}`,
        hash: '#aiStudio',
      })),
      ...reportTools.map((item) => ({
        id: `report-tool-${item.title}`,
        label: item.title,
        subtitle: `Report generator | ${item.subtitle}`,
        haystack: `${item.title} ${item.subtitle} ${item.detail}`,
        hash: '#aiStudio',
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
  }, [data, integrationLaunchers, reportPackPresets, reportTools, searchQuery]);

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
        title="Tax Form Desk"
        description="Focused tax-form launchers and filing posture for the current reporting scope."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {taxScopeSummary ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <StatCard label="Tax Packets" value={taxScopeSummary.taxDocuments} />
              <StatCard label="Open Filing Links" value={taxScopeSummary.openFilingLinks} />
              <StatCard label="TIN Reviews" value={taxScopeSummary.tinReviewItems} />
              <StatCard label="Payroll Records" value={taxScopeSummary.payrollRecords} />
              <StatCard label="Contractor Records" value={taxScopeSummary.contractorRecords} />
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {taxFormTools.map((tool) => (
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
        </div>
      </PageSection>

      <PageSection
        title="Report Generators"
        description="Generate live operating reports from current ERP, treasury, rail, and exception data."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              padding: 16,
              borderRadius: 18,
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(15,23,42,0.35)',
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--cf-muted)', fontWeight: 700 }}>
                Report Entity
              </label>
              <select
                value={reportEntity?.id || ''}
                onChange={(event) => setReportEntityId(event.target.value)}
                style={{
                  minHeight: 42,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#e5e7eb',
                }}
              >
                {data.entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.displayName || entity.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--cf-muted)', fontWeight: 700 }}>
                Report Window
              </label>
              <select
                value={reportWindow}
                onChange={(event) => setReportWindow(event.target.value as ReportWindowOption)}
                style={{
                  minHeight: 42,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#e5e7eb',
                }}
              >
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="365d">Last 12 months</option>
                <option value="all">Full history</option>
              </select>
            </div>
            <WorkbenchRecordCard
              title="Current Report Scope"
              subtitle={reportEntity ? reportEntity.displayName || reportEntity.name : 'No entity selected'}
              actionSlot={
                <button
                  type="button"
                  onClick={launchFullOperationsPack}
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
                  Generate Full Ops Pack
                </button>
              }
              >
                {reportEntity
                  ? `${reportWindowLabel} scope across settlement rails, reserve posture, and operating exceptions for ${reportEntity.displayName || reportEntity.name}.`
                  : 'Choose an entity to generate scoped reporting output.'}
            </WorkbenchRecordCard>
          </div>

          {reportScopeSummary ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <StatCard label="Payments In Scope" value={reportScopeSummary.payments} />
              <StatCard label="Documents In Scope" value={reportScopeSummary.documents} />
              <StatCard label="Proof Chains" value={reportScopeSummary.proofChains} />
              <StatCard label="Rail Issues" value={reportScopeSummary.railIssues} />
              <StatCard label="Filing Items" value={reportScopeSummary.filingItems} />
              <StatCard label="Compliance Reviews" value={reportScopeSummary.complianceReviews} />
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {reportPackPresets.map((tool) => (
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
