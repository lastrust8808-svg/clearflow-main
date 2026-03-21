import type { Dispatch, SetStateAction } from 'react';
import type {
  AIWorkflowRecord,
  CoreDataBundle,
  DocumentCategory,
  DocumentRecord,
  InstrumentRecord,
  ObligationRecord,
  TokenRecord,
} from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface AIStudioPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const researchLinks = [
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
    title: 'Cornell LII UCC Library',
    subtitle: 'Commercial law reference',
    url: 'https://www.law.cornell.edu/ucc',
    detail: 'Reference UCC articles and core commercial-law text while drafting notes, assignments, and remittance logic.',
  },
];

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildGeneratedDocument(input: {
  entityId: string;
  title: string;
  category: DocumentCategory;
  summary: string;
  templateKey?: DocumentRecord['templateKey'];
  body: string;
}): DocumentRecord {
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

export default function AIStudioPage({ data, setData }: AIStudioPageProps) {
  const primaryEntity = data.entities[0];
  const digitalCount = data.aiWorkflows.filter((item) => item.category === 'digital_asset').length;
  const complianceCount = data.aiWorkflows.filter((item) => item.category === 'compliance').length;

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

    setData((prev) => ({
      ...prev,
      documents: [document, ...prev.documents],
    }));
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

    setData((prev) => ({
      ...prev,
      documents: [document, ...prev.documents],
    }));
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

    setData((prev) => ({
      ...prev,
      documents: [document, ...prev.documents],
    }));
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

    setData((prev) => ({
      ...prev,
      documents: [document, ...prev.documents],
    }));
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
  };

  const studioTools: Array<{
    title: string;
    subtitle: string;
    detail: string;
    actionLabel: string;
    onAction: () => void;
  }> = [
    {
      title: 'Business Docs Builder',
      subtitle: 'Packets for operating, vendor, and bank support',
      detail: 'Create a working draft packet for business-facing documents and operating controls.',
      actionLabel: 'Create Packet',
      onAction: launchBusinessPacket,
    },
    {
      title: 'Trustee Support Desk',
      subtitle: 'Help for trustees and authority workflows',
      detail: 'Spin up a trustee guidance packet with duties, authority reminders, and next-action planning.',
      actionLabel: 'Create Trustee Packet',
      onAction: launchTrusteePacket,
    },
    {
      title: 'Purchase Agreement Draft',
      subtitle: 'Acquisition papering and transfer support',
      detail: 'Draft a purchase agreement shell for assets, contract rights, or operating acquisitions.',
      actionLabel: 'Draft Agreement',
      onAction: launchPurchaseAgreement,
    },
    {
      title: 'Promissory Note Into Ledger',
      subtitle: 'Instrument, obligation, token, and journal draft in one move',
      detail: 'Create a note package that lands directly in instruments, obligations, documents, tokens, and journals.',
      actionLabel: 'Draft Note Package',
      onAction: launchPromissoryNote,
    },
    {
      title: 'Logo Creator Brief',
      subtitle: 'Entity branding direction for packets and invoices',
      detail: 'Create a branding brief so logo and visual identity work can stay tied to the entity profile.',
      actionLabel: 'Create Brief',
      onAction: launchLogoBrief,
    },
  ];

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
        <StatCard label="Output Formats" value="DOCX / PDF / Markdown" />
      </div>

      <PageSection
        title="Execution Studio"
        description="Launch useful resources directly into the operating system instead of starting from a blank page."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {studioTools.map((tool) => (
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
