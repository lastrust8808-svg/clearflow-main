import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  AuthorityRecord,
  ComplianceTagRecord,
  CoreDataBundle,
  DocumentRecord,
  EntityRecord,
  TokenRecord,
} from '../../types/core';
import {
  buildBankOnboardingChecklist,
  buildExecutionDocumentBody,
} from '../../services/entityExecutionTemplates.service';

type ExecutionType =
  | 'formation_packet'
  | 'signer_assignment'
  | 'banking_setup'
  | 'operating_agreement'
  | 'compliance_kickoff';

interface EntityExecutionStudioProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const executionOptions: Array<{
  value: ExecutionType;
  label: string;
  description: string;
}> = [
  {
    value: 'formation_packet',
    label: 'Formation Packet',
    description:
      'Create the core formation memo, kickoff compliance tags, and the initial legal identity packet for the entity.',
  },
  {
    value: 'signer_assignment',
    label: 'Signer Assignment',
    description:
      'Issue the signer/authority records, create the assignment memo, and mint a verification token when policy requires it.',
  },
  {
    value: 'banking_setup',
    label: 'Banking Setup Rail',
    description:
      'Create the banking setup packet, add readiness controls, and optionally generate the first bank account shell.',
  },
  {
    value: 'operating_agreement',
    label: 'Operating Agreement',
    description:
      'Draft the governing document packet and the supporting authority/control memo for the entity.',
  },
  {
    value: 'compliance_kickoff',
    label: 'Compliance Kickoff',
    description:
      'Generate the compliance launch memo and the first wave of due-date and control tags to work from.',
  },
];

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(10, 11, 24, 0.78)',
  color: '#fff6fd',
  padding: '10px 12px',
  fontSize: 14,
};

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleize(value: string) {
  return value.replace(/_/g, ' ');
}

function shouldIssueAuthorityToken(entity: EntityRecord, data: CoreDataBundle) {
  return (
    entity.operationalDefaults?.autoIssueVerificationTokens ??
    data.workspaceSettings.autoIssueVerificationTokens
  );
}

export default function EntityExecutionStudio({
  data,
  setData,
}: EntityExecutionStudioProps) {
  const [selectedEntityId, setSelectedEntityId] = useState(data.entities[0]?.id ?? '');
  const [executionType, setExecutionType] =
    useState<ExecutionType>('formation_packet');
  const [formState, setFormState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedEntityId && data.entities[0]?.id) {
      setSelectedEntityId(data.entities[0].id);
    }
  }, [data.entities, selectedEntityId]);

  useEffect(() => {
    const entity = data.entities.find((item) => item.id === selectedEntityId);
    setFormState({
      signerName: entity?.representativeName || '',
      signerRole: entity?.representativeRole || 'Authorized Representative',
      signerEmail: entity?.branding?.replyToEmail || '',
      signerPhone: '',
      signerDate: new Date().toISOString().slice(0, 10),
      institutionName: '',
      accountName: `${entity?.displayName || entity?.name || 'Entity'} Operating`,
      formationDate: entity?.formationDate || new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      documentTitle: '',
      notes: '',
    });
  }, [executionType, selectedEntityId]);

  const selectedEntity = useMemo(
    () => data.entities.find((entity) => entity.id === selectedEntityId),
    [data.entities, selectedEntityId]
  );

  const recentExecutionOutputs = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }

    const entityDocuments = data.documents
      .filter((document) => document.entityId === selectedEntity.id)
      .slice(0, 6)
      .map((document) => ({
        id: document.id,
        label: document.title,
        kind: 'Document',
      }));

    const entityTags = data.complianceTags
      .filter((tag) => tag.entityId === selectedEntity.id)
      .slice(0, 4)
      .map((tag) => ({
        id: tag.id,
        label: tag.label,
        kind: 'Compliance Tag',
      }));

    return [...entityDocuments, ...entityTags].slice(0, 8);
  }, [data.complianceTags, data.documents, selectedEntity]);

  if (!data.entities.length) {
    return (
      <div style={{ color: 'var(--cf-muted)' }}>
        Add an entity first, then execution bundles can be launched here.
      </div>
    );
  }

  const updateField = (key: string, value: string) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

  const createDocument = (
    entityId: string,
    title: string,
    category: DocumentRecord['category'],
    summary: string,
    date: string,
    templateKey?: DocumentRecord['templateKey'],
    generatedBody?: string,
    linkedAuthorityRecordIds?: string[],
    linkedComplianceTagIds?: string[],
    linkedTokenIds?: string[]
  ): DocumentRecord => ({
    id: buildId('doc'),
    entityId,
    title,
    category,
    date,
    status: 'draft',
    templateKey,
    outputStatus: 'drafting',
    generatedBody,
    summary,
    linkedAuthorityRecordIds,
    linkedComplianceTagIds,
    linkedTokenIds,
  });

  const createComplianceTag = (
    entityId: string,
    label: string,
    category: ComplianceTagRecord['category'],
    status: ComplianceTagRecord['status'],
    dueDate?: string,
    notes?: string
  ): ComplianceTagRecord => ({
    id: buildId('cmp'),
    entityId,
    label,
    category,
    status,
    dueDate,
    jurisdiction: selectedEntity?.jurisdiction,
    notes,
  });

  const handleExecute = () => {
    if (!selectedEntity) {
      return;
    }

    setData((prev) => {
      const entity = selectedEntity;
      const nextDocuments: DocumentRecord[] = [];
      const nextTags: ComplianceTagRecord[] = [];
      const nextAuthorityRecords: AuthorityRecord[] = [];
      const nextTokens: TokenRecord[] = [];
      const nextBankAccounts = [...prev.bankAccounts];

      if (executionType === 'formation_packet') {
        const formationDocument = createDocument(
          entity.id,
          formState.documentTitle || `${entity.displayName || entity.name} Formation Packet`,
          'governing',
          'Formation packet covering legal identity, governing setup, and launch controls.',
          formState.formationDate,
          'formation_packet',
          buildExecutionDocumentBody('formation_packet', entity, {
            notes: formState.notes,
          })
        );
        nextDocuments.push(formationDocument);
        nextTags.push(
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} formation records review`,
            'entity',
            'review',
            formState.dueDate,
            'Confirm governing records, formation details, and authority stack.'
          ),
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} tax registration kickoff`,
            'tax',
            'review',
            formState.dueDate,
            'Confirm EIN, tax classification, and filing setup.'
          )
        );
        nextTags[0].linkedDocumentIds = [formationDocument.id];
        nextTags[1].linkedDocumentIds = [formationDocument.id];
      }

      if (executionType === 'signer_assignment') {
        const authorityRecord: AuthorityRecord = {
          id: buildId('auth'),
          entityId: entity.id,
          personName: formState.signerName || entity.representativeName || 'Authorized Signer',
          signerEmail: formState.signerEmail || undefined,
          signerPhone: formState.signerPhone || undefined,
          recordType: 'client_authorization',
          effectiveDate: formState.signerDate,
          clientAuthorizationStatus: 'active',
          approvalStatus: 'pending_acceptance',
          notes: `${formState.signerRole || 'Authorized Representative'} signer assignment created from execution studio.`,
        };
        nextAuthorityRecords.push(authorityRecord);

        const authorityToken = shouldIssueAuthorityToken(entity, prev)
          ? {
              id: buildId('tok'),
              entityId: entity.id,
              subjectType: 'authority_record' as const,
              subjectId: authorityRecord.id,
              label: `${authorityRecord.personName} signer verification token`,
              status: 'issued' as const,
              tokenStandard: 'internal-proof',
              tokenReference: `AUTH-${(entity.displayName || entity.name).slice(0, 8).toUpperCase()}`,
              issuedAt: new Date().toISOString(),
              proofReference: 'Generated from Entity Execution Studio signer assignment.',
            }
          : null;

        if (authorityToken) {
          authorityRecord.linkedTokenIds = [authorityToken.id];
          nextTokens.push(authorityToken);
        }

        nextDocuments.push(
          createDocument(
            entity.id,
            formState.documentTitle || `${authorityRecord.personName} Signer Assignment Memo`,
            'authority_record',
            'Signer authority packet covering designation, scope, and reply-to/contact posture.',
            formState.signerDate,
            'signer_assignment',
            buildExecutionDocumentBody('signer_assignment', entity, {
              signerName: authorityRecord.personName,
              signerRole: formState.signerRole,
              signerEmail: authorityRecord.signerEmail,
              signerPhone: authorityRecord.signerPhone,
              effectiveDate: formState.signerDate,
            }),
            [authorityRecord.id],
            undefined,
            authorityToken ? [authorityToken.id] : undefined
          )
        );
      }

      if (executionType === 'banking_setup') {
        const bankSetupMemo = createDocument(
          entity.id,
          formState.documentTitle || `${entity.displayName || entity.name} Banking Setup Packet`,
          'financial',
          'Banking setup rail for account opening, settlement defaults, and control owner signoff.',
          formState.signerDate,
          'banking_setup',
          buildExecutionDocumentBody('banking_setup', entity, {
            institutionName: formState.institutionName,
            signerName: formState.signerName,
            notes: formState.notes,
          })
        );
        const taxSupportDocument = createDocument(
          entity.id,
          `${entity.displayName || entity.name} Tax Registration Support`,
          'tax',
          'Upload EIN confirmation, tax registration support, or substitute authority.',
          formState.signerDate
        );
        const authoritySupportDocument = createDocument(
          entity.id,
          `${entity.displayName || entity.name} Banking Authority Resolution`,
          'authority_record',
          'Attach banking resolution, signer memo, or board/member authority approval.',
          formState.signerDate
        );
        nextDocuments.push(bankSetupMemo);
        nextDocuments.push(taxSupportDocument, authoritySupportDocument);
        nextTags.push(
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} bank KYC / onboarding`,
            'reporting',
            'review',
            formState.dueDate,
            'Collect authority packet, tax forms, and bank onboarding support.'
          )
        );
        nextTags[0].linkedDocumentIds = [
          bankSetupMemo.id,
          taxSupportDocument.id,
          authoritySupportDocument.id,
        ];

        nextBankAccounts.unshift({
          id: buildId('bank'),
          entityId: entity.id,
          institutionName: formState.institutionName || 'Pending Institution',
          accountName:
            formState.accountName ||
            `${entity.displayName || entity.name} Operating`,
          accountType: 'checking',
          currency:
            entity.operationalDefaults?.baseCurrency ||
            prev.workspaceSettings.baseCurrency,
          status: 'inactive',
          currentBalance: 0,
          linkedDocumentIds: [bankSetupMemo.id, taxSupportDocument.id, authoritySupportDocument.id],
          onboardingStatus: 'collecting',
          onboardingChecklist: buildBankOnboardingChecklist({
            packetDocumentId: bankSetupMemo.id,
            taxDocumentId: taxSupportDocument.id,
            authorityDocumentId: authoritySupportDocument.id,
          }),
        });
      }

      if (executionType === 'operating_agreement') {
        const governingDocument = createDocument(
          entity.id,
          formState.documentTitle || `${entity.displayName || entity.name} Governing Agreement`,
          'governing',
          'Draft governing agreement or operating control memo linked to the entity record.',
          formState.signerDate,
          'operating_agreement',
          buildExecutionDocumentBody('operating_agreement', entity, {
            notes: formState.notes,
          })
        );
        nextDocuments.push(governingDocument);
        nextTags.push(
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} governance approval`,
            'authority',
            'review',
            formState.dueDate,
            'Finalize governing document, signatures, and board/member consent.'
          )
        );
        nextTags[0].linkedDocumentIds = [governingDocument.id];
      }

      if (executionType === 'compliance_kickoff') {
        const kickoffDocument = createDocument(
          entity.id,
          formState.documentTitle || `${entity.displayName || entity.name} Compliance Kickoff Memo`,
          'compliance',
          'Launch memo for recurring filings, reporting, and control deadlines.',
          formState.signerDate,
          'compliance_kickoff',
          buildExecutionDocumentBody('compliance_kickoff', entity, {
            effectiveDate: formState.signerDate,
            notes: formState.notes,
          })
        );
        nextDocuments.push(
          kickoffDocument
        );
        nextTags.push(
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} annual report calendar`,
            'entity',
            'review',
            formState.dueDate,
            'Seed annual report and jurisdiction maintenance deadlines.'
          ),
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} tax filing readiness`,
            'tax',
            'review',
            formState.dueDate,
            'Seed tax classification, estimated payment, and return prep controls.'
          ),
          createComplianceTag(
            entity.id,
            `${entity.displayName || entity.name} document retention controls`,
            'reporting',
            'ok',
            undefined,
            'Start vault retention and core records support review.'
          )
        );
        nextTags.forEach((tag) => {
          tag.linkedDocumentIds = [kickoffDocument.id];
        });
      }

      return {
        ...prev,
        bankAccounts: nextBankAccounts,
        documents: [...nextDocuments, ...prev.documents],
        complianceTags: [...nextTags, ...prev.complianceTags],
        authorityRecords: [...nextAuthorityRecords, ...prev.authorityRecords],
        tokens: [...nextTokens, ...prev.tokens],
      };
    });
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Target Entity</span>
          <select
            style={inputStyle}
            value={selectedEntityId}
            onChange={(event) => setSelectedEntityId(event.target.value)}
          >
            {data.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.displayName || entity.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Execution Bundle</span>
          <select
            style={inputStyle}
            value={executionType}
            onChange={(event) => setExecutionType(event.target.value as ExecutionType)}
          >
            {executionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 16,
          border: '1px solid rgba(126, 242, 255, 0.16)',
          background: 'rgba(11, 20, 38, 0.72)',
          color: 'var(--cf-muted)',
          lineHeight: 1.6,
        }}
      >
        {executionOptions.find((option) => option.value === executionType)?.description}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Primary Document Title</span>
          <input
            style={inputStyle}
            value={formState.documentTitle || ''}
            onChange={(event) => updateField('documentTitle', event.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Follow-Up Due Date</span>
          <input
            type="date"
            style={inputStyle}
            value={formState.dueDate || ''}
            onChange={(event) => updateField('dueDate', event.target.value)}
          />
        </label>
      </div>

      {(executionType === 'signer_assignment' || executionType === 'banking_setup') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Signer / Lead Contact</span>
            <input
              style={inputStyle}
              value={formState.signerName || ''}
              onChange={(event) => updateField('signerName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Role</span>
            <input
              style={inputStyle}
              value={formState.signerRole || ''}
              onChange={(event) => updateField('signerRole', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Signer Email</span>
            <input
              style={inputStyle}
              value={formState.signerEmail || ''}
              onChange={(event) => updateField('signerEmail', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Signer Phone</span>
            <input
              style={inputStyle}
              value={formState.signerPhone || ''}
              onChange={(event) => updateField('signerPhone', event.target.value)}
            />
          </label>
        </div>
      )}

      {executionType === 'banking_setup' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Target Institution</span>
            <input
              style={inputStyle}
              value={formState.institutionName || ''}
              onChange={(event) => updateField('institutionName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Shell Name</span>
            <input
              style={inputStyle}
              value={formState.accountName || ''}
              onChange={(event) => updateField('accountName', event.target.value)}
            />
          </label>
        </div>
      )}

      <label style={{ display: 'grid', gap: 6 }}>
        <span>Execution Notes</span>
        <textarea
          style={{ ...inputStyle, minHeight: 110 }}
          value={formState.notes || ''}
          onChange={(event) => updateField('notes', event.target.value)}
        />
      </label>

      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>Bundle Preview</div>
        {executionType === 'formation_packet' && (
          <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
            This will create a governing formation packet plus kickoff compliance tags for
            formation records and tax setup.
          </div>
        )}
        {executionType === 'signer_assignment' && (
          <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
            This will create an authority record, a signer assignment memo, and a verification
            token when the entity or workspace policy requires one.
          </div>
        )}
        {executionType === 'banking_setup' && (
          <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
            This will create a banking setup memo, a KYC/onboarding compliance tag, and an
            inactive bank account shell ready for connection.
          </div>
        )}
        {executionType === 'operating_agreement' && (
          <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
            This will create the governing agreement draft and a governance approval tag so the
            entity has a real follow-through trail.
          </div>
        )}
        {executionType === 'compliance_kickoff' && (
          <div style={{ color: 'var(--cf-muted)', lineHeight: 1.6 }}>
            This will create the kickoff memo and seed the first entity, tax, and retention
            control tags.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleExecute}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(126, 242, 255, 0.28)',
            background:
              'linear-gradient(135deg, rgba(33, 194, 198, 0.9), rgba(88, 141, 255, 0.82))',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Launch Bundle
        </button>
        <div style={{ color: 'var(--cf-muted)', alignSelf: 'center' }}>
          These bundles create linked records so the entity has actionable next steps, not just a
          profile card.
        </div>
      </div>

      <div
        style={{
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>Recent Execution Output</div>
        {recentExecutionOutputs.length === 0 ? (
          <div style={{ color: 'var(--cf-muted)' }}>
            No execution bundles have been launched for this entity yet.
          </div>
        ) : (
          recentExecutionOutputs.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(8, 13, 27, 0.56)',
              }}
            >
              <div>{item.label}</div>
              <div style={{ color: 'var(--cf-muted)' }}>{item.kind}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
