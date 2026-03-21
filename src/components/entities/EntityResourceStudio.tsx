import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  AuthorityRecord,
  BankAccountRecord,
  CoreDataBundle,
  DocumentRecord,
  InstrumentRecord,
  ObligationRecord,
  WalletRecord,
} from '../../types/core';

type ResourceType =
  | 'bankAccount'
  | 'wallet'
  | 'authority'
  | 'instrument'
  | 'obligation'
  | 'document';

interface EntityResourceStudioProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const resourceTypeOptions: Array<{ value: ResourceType; label: string; description: string }> = [
  {
    value: 'bankAccount',
    label: 'Bank Account',
    description: 'Create operating, reserve, custodial, or reconciliation-ready bank accounts.',
  },
  {
    value: 'wallet',
    label: 'Wallet',
    description: 'Set up digital-asset custody, multisig, contract, or exchange-linked wallets.',
  },
  {
    value: 'authority',
    label: 'Authority Record',
    description: 'Track signer, trustee, manager, or client authorization authority.',
  },
  {
    value: 'instrument',
    label: 'Instrument',
    description: 'Issue notes, contract rights, tokenized claims, or pledged securities.',
  },
  {
    value: 'obligation',
    label: 'Obligation',
    description: 'Stand up liabilities, reserve-backed claims, or secured private obligations.',
  },
  {
    value: 'document',
    label: 'Control Document',
    description: 'Create the operational memo or authority document the entity needs next.',
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

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildResourceSummary(data: CoreDataBundle, entityId: string) {
  return {
    bankAccounts: data.bankAccounts.filter((item) => item.entityId === entityId).length,
    wallets: data.wallets.filter((item) => item.entityId === entityId).length,
    authorityRecords: data.authorityRecords.filter((item) => item.entityId === entityId).length,
    instruments: data.instruments.filter((item) => item.entityId === entityId).length,
    obligations: data.obligations.filter((item) => item.entityId === entityId).length,
    documents: data.documents.filter((item) => item.entityId === entityId).length,
  };
}

export default function EntityResourceStudio({
  data,
  setData,
}: EntityResourceStudioProps) {
  const [selectedEntityId, setSelectedEntityId] = useState(data.entities[0]?.id ?? '');
  const [resourceType, setResourceType] = useState<ResourceType>('bankAccount');
  const [formState, setFormState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedEntityId && data.entities[0]?.id) {
      setSelectedEntityId(data.entities[0].id);
    }
  }, [data.entities, selectedEntityId]);

  useEffect(() => {
    const selectedEntity = data.entities.find((entity) => entity.id === selectedEntityId);
    setFormState({
      currency:
        selectedEntity?.operationalDefaults?.baseCurrency ||
        data.workspaceSettings.baseCurrency ||
        'USD',
      accountType: 'checking',
      institutionName: '',
      accountName: '',
      currentBalance: '',
      walletName: '',
      walletNetwork: 'ethereum',
      walletAddress: '',
      walletCustodyType: 'self_custody',
      authorityPersonName: '',
      authorityType: 'client_authorization',
      authorityStatus: 'active',
      authorityDate: new Date().toISOString().slice(0, 10),
      authorityNotes: '',
      instrumentTitle: '',
      instrumentType: 'promissory_note',
      instrumentAmount: '',
      instrumentDate: new Date().toISOString().slice(0, 10),
      instrumentNotes: '',
      obligationTitle: '',
      obligationType: 'private_obligation',
      obligationAmount: '',
      obligationPaymentMedium: 'fiat',
      obligationStatus: 'open',
      documentTitle: '',
      documentCategory: 'authority_record',
      documentDate: new Date().toISOString().slice(0, 10),
      documentSummary: '',
    });
  }, [data.workspaceSettings.baseCurrency, resourceType, selectedEntityId]);

  const selectedEntity = useMemo(
    () => data.entities.find((entity) => entity.id === selectedEntityId),
    [data.entities, selectedEntityId]
  );

  const summary = selectedEntity
    ? buildResourceSummary(data, selectedEntity.id)
    : {
        bankAccounts: 0,
        wallets: 0,
        authorityRecords: 0,
        instruments: 0,
        obligations: 0,
        documents: 0,
      };

  const recentResources = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }

    const entityId = selectedEntity.id;
    return [
      ...data.bankAccounts
        .filter((item) => item.entityId === entityId)
        .map((item) => ({ id: item.id, label: item.accountName, kind: 'Bank Account' })),
      ...data.wallets
        .filter((item) => item.entityId === entityId)
        .map((item) => ({ id: item.id, label: item.name, kind: 'Wallet' })),
      ...data.authorityRecords
        .filter((item) => item.entityId === entityId)
        .map((item) => ({ id: item.id, label: item.personName, kind: 'Authority' })),
      ...data.instruments
        .filter((item) => item.entityId === entityId)
        .map((item) => ({ id: item.id, label: item.title, kind: 'Instrument' })),
      ...data.obligations
        .filter((item) => item.entityId === entityId)
        .map((item) => ({ id: item.id, label: item.title, kind: 'Obligation' })),
      ...data.documents
        .filter((item) => item.entityId === entityId)
        .map((item) => ({ id: item.id, label: item.title, kind: 'Document' })),
    ].slice(0, 8);
  }, [data, selectedEntity]);

  if (!data.entities.length) {
    return (
      <div style={{ color: 'var(--cf-muted)' }}>
        Create an entity first, then its operating resources can be generated here.
      </div>
    );
  }

  const updateField = (key: string, value: string) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

  const handleCreateResource = () => {
    if (!selectedEntity) {
      return;
    }

    setData((prev) => {
      const entityId = selectedEntity.id;

      if (resourceType === 'bankAccount') {
        const nextRecord: BankAccountRecord = {
          id: buildId('bank'),
          entityId,
          institutionName: formState.institutionName || 'Operating Bank',
          accountName: formState.accountName || `${selectedEntity.displayName || selectedEntity.name} Operating`,
          accountType: (formState.accountType as BankAccountRecord['accountType']) || 'checking',
          currency: formState.currency || 'USD',
          status: 'active',
          currentBalance: Number(formState.currentBalance || 0),
        };

        return { ...prev, bankAccounts: [nextRecord, ...prev.bankAccounts] };
      }

      if (resourceType === 'wallet') {
        const nextRecord: WalletRecord = {
          id: buildId('wallet'),
          entityId,
          name: formState.walletName || `${selectedEntity.displayName || selectedEntity.name} Wallet`,
          network: formState.walletNetwork || 'ethereum',
          address: formState.walletAddress || 'pending-assignment',
          custodyType: (formState.walletCustodyType as WalletRecord['custodyType']) || 'self_custody',
          notes: 'Created from Entity Resource Studio.',
        };

        return { ...prev, wallets: [nextRecord, ...prev.wallets] };
      }

      if (resourceType === 'authority') {
        const nextRecord: AuthorityRecord = {
          id: buildId('auth'),
          entityId,
          personName: formState.authorityPersonName || selectedEntity.representativeName || 'Authorized Representative',
          recordType: (formState.authorityType as AuthorityRecord['recordType']) || 'client_authorization',
          effectiveDate: formState.authorityDate,
          clientAuthorizationStatus:
            (formState.authorityStatus as AuthorityRecord['clientAuthorizationStatus']) || 'active',
          notes: formState.authorityNotes || 'Created from Entity Resource Studio.',
        };

        return { ...prev, authorityRecords: [nextRecord, ...prev.authorityRecords] };
      }

      if (resourceType === 'instrument') {
        const nextRecord: InstrumentRecord = {
          id: buildId('inst'),
          entityId,
          title: formState.instrumentTitle || `${selectedEntity.displayName || selectedEntity.name} Instrument`,
          instrumentType:
            (formState.instrumentType as InstrumentRecord['instrumentType']) || 'promissory_note',
          issueDate: formState.instrumentDate,
          denominationValue: Number(formState.instrumentAmount || 0),
          paymentMedium: 'fiat',
          linkedDocumentIds: [],
          notes: formState.instrumentNotes || 'Created from Entity Resource Studio.',
        };

        return { ...prev, instruments: [nextRecord, ...prev.instruments] };
      }

      if (resourceType === 'obligation') {
        const nextRecord: ObligationRecord = {
          id: buildId('obl'),
          entityId,
          title: formState.obligationTitle || `${selectedEntity.displayName || selectedEntity.name} Obligation`,
          obligationType:
            (formState.obligationType as ObligationRecord['obligationType']) || 'private_obligation',
          amount: Number(formState.obligationAmount || 0),
          paymentMedium:
            (formState.obligationPaymentMedium as ObligationRecord['paymentMedium']) || 'fiat',
          status: (formState.obligationStatus as ObligationRecord['status']) || 'open',
          linkedDocumentIds: [],
        };

        return { ...prev, obligations: [nextRecord, ...prev.obligations] };
      }

      const nextRecord: DocumentRecord = {
        id: buildId('doc'),
        entityId,
        title: formState.documentTitle || `${selectedEntity.displayName || selectedEntity.name} Control Memo`,
        category: (formState.documentCategory as DocumentRecord['category']) || 'authority_record',
        date: formState.documentDate || new Date().toISOString().slice(0, 10),
        status: 'draft',
        summary: formState.documentSummary || 'Created from Entity Resource Studio.',
      };

      return { ...prev, documents: [nextRecord, ...prev.documents] };
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
          <span>Resource Type</span>
          <select
            style={inputStyle}
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value as ResourceType)}
          >
            {resourceTypeOptions.map((option) => (
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
        {
          resourceTypeOptions.find((option) => option.value === resourceType)?.description
        }
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        {[
          ['Bank Accounts', summary.bankAccounts],
          ['Wallets', summary.wallets],
          ['Authority', summary.authorityRecords],
          ['Instruments', summary.instruments],
          ['Obligations', summary.obligations],
          ['Documents', summary.documents],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: 14,
            }}
          >
            <div style={{ color: 'var(--cf-muted)', fontSize: 12 }}>{label}</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>

      {resourceType === 'bankAccount' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Institution Name</span>
            <input
              style={inputStyle}
              value={formState.institutionName || ''}
              onChange={(event) => updateField('institutionName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Name</span>
            <input
              style={inputStyle}
              value={formState.accountName || ''}
              onChange={(event) => updateField('accountName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Account Type</span>
            <select
              style={inputStyle}
              value={formState.accountType || 'checking'}
              onChange={(event) => updateField('accountType', event.target.value)}
            >
              {['checking', 'savings', 'credit_card', 'custodial', 'other'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Currency</span>
            <input
              style={inputStyle}
              value={formState.currency || 'USD'}
              onChange={(event) => updateField('currency', event.target.value)}
            />
          </label>
        </div>
      )}

      {resourceType === 'wallet' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Wallet Name</span>
            <input
              style={inputStyle}
              value={formState.walletName || ''}
              onChange={(event) => updateField('walletName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Network</span>
            <input
              style={inputStyle}
              value={formState.walletNetwork || 'ethereum'}
              onChange={(event) => updateField('walletNetwork', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Address / Identifier</span>
            <input
              style={inputStyle}
              value={formState.walletAddress || ''}
              onChange={(event) => updateField('walletAddress', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Custody Type</span>
            <select
              style={inputStyle}
              value={formState.walletCustodyType || 'self_custody'}
              onChange={(event) => updateField('walletCustodyType', event.target.value)}
            >
              {['self_custody', 'exchange', 'qualified_custodian', 'multisig', 'contract'].map(
                (option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
      )}

      {resourceType === 'authority' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Person Name</span>
            <input
              style={inputStyle}
              value={formState.authorityPersonName || ''}
              onChange={(event) => updateField('authorityPersonName', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Authority Type</span>
            <select
              style={inputStyle}
              value={formState.authorityType || 'client_authorization'}
              onChange={(event) => updateField('authorityType', event.target.value)}
            >
              {[
                'attorney_of_record',
                'private_representative',
                'power_of_attorney',
                'notice_of_appearance',
                'client_authorization',
                'trustee_authority',
                'manager_authority',
                'other',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Authorization Status</span>
            <select
              style={inputStyle}
              value={formState.authorityStatus || 'active'}
              onChange={(event) => updateField('authorityStatus', event.target.value)}
            >
              {['active', 'limited', 'revoked', 'unknown'].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Effective Date</span>
            <input
              type="date"
              style={inputStyle}
              value={formState.authorityDate || ''}
              onChange={(event) => updateField('authorityDate', event.target.value)}
            />
          </label>
        </div>
      )}

      {resourceType === 'instrument' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Instrument Title</span>
            <input
              style={inputStyle}
              value={formState.instrumentTitle || ''}
              onChange={(event) => updateField('instrumentTitle', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Instrument Type</span>
            <select
              style={inputStyle}
              value={formState.instrumentType || 'promissory_note'}
              onChange={(event) => updateField('instrumentType', event.target.value)}
            >
              {[
                'promissory_note',
                'private_bond',
                'pledged_metal_reserve',
                'contract_right',
                'performance_security_posting',
                'tender_designation',
                'tokenized_note',
                'tokenized_equity',
                'custody_record',
                'other',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Denomination / Face Value</span>
            <input
              style={inputStyle}
              type="number"
              value={formState.instrumentAmount || ''}
              onChange={(event) => updateField('instrumentAmount', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Issue Date</span>
            <input
              type="date"
              style={inputStyle}
              value={formState.instrumentDate || ''}
              onChange={(event) => updateField('instrumentDate', event.target.value)}
            />
          </label>
        </div>
      )}

      {resourceType === 'obligation' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Obligation Title</span>
            <input
              style={inputStyle}
              value={formState.obligationTitle || ''}
              onChange={(event) => updateField('obligationTitle', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Obligation Type</span>
            <select
              style={inputStyle}
              value={formState.obligationType || 'private_obligation'}
              onChange={(event) => updateField('obligationType', event.target.value)}
            >
              {[
                'public_obligation',
                'private_obligation',
                'secured_private_obligation',
                'pledged_performance_security',
                'reserve_backed_claim',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Amount</span>
            <input
              style={inputStyle}
              type="number"
              value={formState.obligationAmount || ''}
              onChange={(event) => updateField('obligationAmount', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Payment Medium</span>
            <select
              style={inputStyle}
              value={formState.obligationPaymentMedium || 'fiat'}
              onChange={(event) => updateField('obligationPaymentMedium', event.target.value)}
            >
              {['specie', 'fiat', 'private_tender', 'digital_asset', 'mixed_contractual_tender'].map(
                (option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
      )}

      {resourceType === 'document' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Document Title</span>
            <input
              style={inputStyle}
              value={formState.documentTitle || ''}
              onChange={(event) => updateField('documentTitle', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Document Category</span>
            <select
              style={inputStyle}
              value={formState.documentCategory || 'authority_record'}
              onChange={(event) => updateField('documentCategory', event.target.value)}
            >
              {[
                'governing',
                'financial',
                'compliance',
                'contract',
                'title',
                'tax',
                'authority_record',
                'legal_memo',
                'other',
              ].map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Document Date</span>
            <input
              type="date"
              style={inputStyle}
              value={formState.documentDate || ''}
              onChange={(event) => updateField('documentDate', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Summary</span>
            <input
              style={inputStyle}
              value={formState.documentSummary || ''}
              onChange={(event) => updateField('documentSummary', event.target.value)}
            />
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleCreateResource}
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
          Create Resource
        </button>
        <div style={{ color: 'var(--cf-muted)', alignSelf: 'center' }}>
          New resources inherit the entity’s currency and operating context where available.
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
        <div style={{ fontSize: 15, fontWeight: 700 }}>Recent Entity Resources</div>
        {recentResources.length === 0 ? (
          <div style={{ color: 'var(--cf-muted)' }}>
            This entity does not have any quick-created resources yet.
          </div>
        ) : (
          recentResources.map((resource) => (
            <div
              key={resource.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(8, 13, 27, 0.56)',
              }}
            >
              <div>{resource.label}</div>
              <div style={{ color: 'var(--cf-muted)' }}>{resource.kind}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
