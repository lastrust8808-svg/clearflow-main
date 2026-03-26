import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type {
  CreditRailType,
  EntityConnectionType,
  EntityRecord,
  SettlementPath,
  TreasuryAccountRecord,
} from '../../types/core';

export interface EntityConnectionRailSubmitPayload {
  ownerEntityId: string;
  connectionName: string;
  connectionType: EntityConnectionType;
  relationshipClass:
    | 'shared_control'
    | 'affiliate'
    | 'member_relationship'
    | 'business_partner'
    | 'user_to_user'
    | 'vendor_credit'
    | 'customer_credit'
    | 'other';
  connectedEntityId?: string;
  connectedUserLabel?: string;
  connectedUserEmail?: string;
  connectedWorkspaceLabel?: string;
  railName: string;
  railType: CreditRailType;
  settlementPath: SettlementPath;
  creditLimit: string;
  currency: string;
  linkedTreasuryAccountId?: string;
  requireVerificationTokens: boolean;
  requireComplianceValidation: boolean;
  reserveBacked: boolean;
  autoCreateNoteRemittance: boolean;
  notes: string;
}

interface EntityConnectionRailModalProps {
  open: boolean;
  entities: EntityRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  defaultCurrency: string;
  initialPreset?: 'general' | 'business_partner';
  onClose: () => void;
  onSubmit: (payload: EntityConnectionRailSubmitPayload) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,6,23,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  width: 'min(860px, 100%)',
  maxHeight: '92vh',
  overflowY: 'auto',
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.2)',
  background: '#0f172a',
  color: '#e5e7eb',
  padding: 20,
  display: 'grid',
  gap: 16,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.5)',
  color: '#e5e7eb',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function EntityConnectionRailModal({
  open,
  entities,
  treasuryAccounts,
  defaultCurrency,
  initialPreset = 'general',
  onClose,
  onSubmit,
}: EntityConnectionRailModalProps) {
  const [ownerEntityId, setOwnerEntityId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [connectionType, setConnectionType] = useState<EntityConnectionType>('internal_entity');
  const [relationshipClass, setRelationshipClass] =
    useState<EntityConnectionRailSubmitPayload['relationshipClass']>('shared_control');
  const [connectedEntityId, setConnectedEntityId] = useState('');
  const [connectedUserLabel, setConnectedUserLabel] = useState('');
  const [connectedUserEmail, setConnectedUserEmail] = useState('');
  const [connectedWorkspaceLabel, setConnectedWorkspaceLabel] = useState('');
  const [railName, setRailName] = useState('');
  const [railType, setRailType] = useState<CreditRailType>('intercompany_credit');
  const [settlementPath, setSettlementPath] = useState<SettlementPath>('internal_ledger');
  const [creditLimit, setCreditLimit] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency || 'USD');
  const [linkedTreasuryAccountId, setLinkedTreasuryAccountId] = useState('');
  const [requireVerificationTokens, setRequireVerificationTokens] = useState(true);
  const [requireComplianceValidation, setRequireComplianceValidation] = useState(true);
  const [reserveBacked, setReserveBacked] = useState(true);
  const [autoCreateNoteRemittance, setAutoCreateNoteRemittance] = useState(false);
  const [notes, setNotes] = useState('');

  const ownerEntity = useMemo(
    () => entities.find((entity) => entity.id === ownerEntityId) ?? entities[0],
    [entities, ownerEntityId],
  );

  const internalCounterpartyChoices = entities.filter((entity) => entity.id !== ownerEntityId);
  const treasuryChoices = treasuryAccounts.filter(
    (account) => !ownerEntityId || account.entityId === ownerEntityId,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const firstEntity = entities[0];
    const secondEntity = entities.find((entity) => entity.id !== firstEntity?.id);
    const inferredCurrency =
      firstEntity?.operationalDefaults?.baseCurrency || defaultCurrency || 'USD';

    setOwnerEntityId(firstEntity?.id ?? '');
    setConnectionName('');
    setConnectionType(initialPreset === 'business_partner' ? 'external_user' : 'internal_entity');
    setRelationshipClass(initialPreset === 'business_partner' ? 'business_partner' : 'shared_control');
    setConnectedEntityId(secondEntity?.id ?? '');
    setConnectedUserLabel('');
    setConnectedUserEmail('');
    setConnectedWorkspaceLabel('');
    setRailName('');
    setRailType(initialPreset === 'business_partner' ? 'partner_note' : 'intercompany_credit');
    setSettlementPath(initialPreset === 'business_partner' ? 'tokenized_credit' : 'internal_ledger');
    setCreditLimit('');
    setCurrency(inferredCurrency);
    setLinkedTreasuryAccountId('');
    setRequireVerificationTokens(true);
    setRequireComplianceValidation(true);
    setReserveBacked(true);
    setAutoCreateNoteRemittance(initialPreset === 'business_partner');
    setNotes('');
  }, [defaultCurrency, entities, initialPreset, open]);

  useEffect(() => {
    if (!ownerEntity) {
      return;
    }

    const nextCurrency = ownerEntity.operationalDefaults?.baseCurrency || defaultCurrency || 'USD';
    setCurrency(nextCurrency);
  }, [defaultCurrency, ownerEntity]);

  if (!open) {
    return null;
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Create Connection Rail</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Stand up the operating relationship, credit posture, and settlement rail between one
            entity and another entity or external user in a single step.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <select value={ownerEntityId} onChange={(e) => setOwnerEntityId(e.target.value)} style={inputStyle}>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                Owner entity: {entity.displayName || entity.name}
              </option>
            ))}
          </select>
          <input
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            placeholder="Connection label"
            style={inputStyle}
          />
          <select
            value={connectionType}
            onChange={(e) => setConnectionType(e.target.value as EntityConnectionType)}
            style={inputStyle}
          >
            <option value="internal_entity">Internal entity</option>
            <option value="external_user">External user</option>
            <option value="counterparty_network">Counterparty network</option>
          </select>
          <select
            value={relationshipClass}
            onChange={(e) =>
              setRelationshipClass(e.target.value as EntityConnectionRailSubmitPayload['relationshipClass'])
            }
            style={inputStyle}
          >
            <option value="shared_control">Shared control</option>
            <option value="affiliate">Affiliate</option>
            <option value="member_relationship">Member relationship</option>
            <option value="business_partner">Business partner</option>
            <option value="user_to_user">User to user</option>
            <option value="vendor_credit">Vendor credit</option>
            <option value="customer_credit">Customer credit</option>
            <option value="other">Other</option>
          </select>
        </div>

        {connectionType === 'internal_entity' ? (
          <select
            value={connectedEntityId}
            onChange={(e) => setConnectedEntityId(e.target.value)}
            style={inputStyle}
          >
            {internalCounterpartyChoices.map((entity) => (
              <option key={entity.id} value={entity.id}>
                Connected entity: {entity.displayName || entity.name}
              </option>
            ))}
          </select>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <input
              value={connectedUserLabel}
              onChange={(e) => setConnectedUserLabel(e.target.value)}
              placeholder="Connected user / network label"
              style={inputStyle}
            />
            <input
              value={connectedUserEmail}
              onChange={(e) => setConnectedUserEmail(e.target.value)}
              placeholder="Connected user email"
              style={inputStyle}
            />
            <input
              value={connectedWorkspaceLabel}
              onChange={(e) => setConnectedWorkspaceLabel(e.target.value)}
              placeholder="Workspace / network label"
              style={inputStyle}
            />
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <input
            value={railName}
            onChange={(e) => setRailName(e.target.value)}
            placeholder="Rail name"
            style={inputStyle}
          />
          <select value={railType} onChange={(e) => setRailType(e.target.value as CreditRailType)} style={inputStyle}>
            <option value="intercompany_credit">Intercompany credit</option>
            <option value="member_credit">Member credit</option>
            <option value="reserve_bridge">Reserve bridge</option>
            <option value="vendor_credit">Vendor credit</option>
            <option value="peer_settlement">Peer settlement</option>
          </select>
          <select
            value={settlementPath}
            onChange={(e) => setSettlementPath(e.target.value as SettlementPath)}
            style={inputStyle}
          >
            <option value="internal_ledger">Internal ledger</option>
            <option value="ach">ACH</option>
            <option value="wire">Wire</option>
            <option value="wallet">Wallet</option>
            <option value="tokenized_credit">Tokenized credit</option>
            <option value="tokenized_debit">Tokenized debit</option>
            <option value="mixed">Mixed</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="Credit limit / reserve cap"
            style={inputStyle}
          />
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Currency" style={inputStyle} />
          <select
            value={linkedTreasuryAccountId}
            onChange={(e) => setLinkedTreasuryAccountId(e.target.value)}
            style={inputStyle}
          >
            <option value="">No linked treasury account</option>
            {treasuryChoices.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={requireVerificationTokens}
              onChange={(e) => setRequireVerificationTokens(e.target.checked)}
            />
            Require verification tokens on this rail
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={requireComplianceValidation}
              onChange={(e) => setRequireComplianceValidation(e.target.checked)}
            />
            Require compliance validation before release
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={reserveBacked}
              onChange={(e) => setReserveBacked(e.target.checked)}
            />
            Prefer reserve-backed or treasury-backed settlement
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={autoCreateNoteRemittance}
              onChange={(e) => setAutoCreateNoteRemittance(e.target.checked)}
            />
            Auto-structure note and remittance flow for connected holders
          </label>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes about settlement permissions, reserve posture, or exposure controls"
          style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                ownerEntityId,
                connectionName,
                connectionType,
                relationshipClass,
                connectedEntityId: connectionType === 'internal_entity' ? connectedEntityId : undefined,
                connectedUserLabel: connectionType !== 'internal_entity' ? connectedUserLabel : undefined,
                connectedUserEmail: connectionType !== 'internal_entity' ? connectedUserEmail : undefined,
                connectedWorkspaceLabel:
                  connectionType !== 'internal_entity' ? connectedWorkspaceLabel : undefined,
                railName,
                railType,
                settlementPath,
                creditLimit,
                currency,
                linkedTreasuryAccountId: linkedTreasuryAccountId || undefined,
                requireVerificationTokens,
                requireComplianceValidation,
                reserveBacked,
                autoCreateNoteRemittance,
                notes,
              })
            }
            style={{
              ...buttonStyle,
              background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))',
              borderColor: 'rgba(126,242,255,0.28)',
            }}
          >
            Create Connection Rail
          </button>
        </div>
      </div>
    </div>
  );
}
