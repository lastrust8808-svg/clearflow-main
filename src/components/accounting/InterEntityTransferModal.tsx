import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EntityRecord } from '../../types/core';
import type { InterEntityTransferSubmitPayload } from './accountingTypes';

interface InterEntityTransferModalProps {
  open: boolean;
  entities: EntityRecord[];
  onClose: () => void;
  onSubmit: (payload: InterEntityTransferSubmitPayload) => void;
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
  width: 'min(760px, 100%)',
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

export default function InterEntityTransferModal({
  open,
  entities,
  onClose,
  onSubmit,
}: InterEntityTransferModalProps) {
  const [fromEntityId, setFromEntityId] = useState('');
  const [toEntityId, setToEntityId] = useState('');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [memo, setMemo] = useState('');
  const [settlementMode, setSettlementMode] = useState<'mirrored_halves' | 'cross_entity_clearing'>(
    'mirrored_halves'
  );
  const [fromCashAccount, setFromCashAccount] = useState('1000 Operating Cash');
  const [toCashAccount, setToCashAccount] = useState('1000 Operating Cash');

  useEffect(() => {
    if (!open) return;

    const defaultFrom = entities[0]?.id ?? '';
    const defaultTo = entities[1]?.id ?? entities[0]?.id ?? '';

    setFromEntityId(defaultFrom);
    setToEntityId(defaultTo);
    setAmount('');
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setMemo('');
    setSettlementMode('mirrored_halves');
    setFromCashAccount('1000 Operating Cash');
    setToCashAccount('1000 Operating Cash');
  }, [open, entities]);

  if (!open) return null;

  const validCounterpartyChoices = entities.filter((entity) => entity.id !== fromEntityId);

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Intercompany Transfer</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Post both sides of an entity-to-entity move with due-from and due-to journals in one
            ERP action.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <select
              value={fromEntityId}
              onChange={(e) => {
                const nextFrom = e.target.value;
                setFromEntityId(nextFrom);
                if (nextFrom === toEntityId) {
                  const fallback = entities.find((entity) => entity.id !== nextFrom)?.id ?? '';
                  setToEntityId(fallback);
                }
              }}
              style={inputStyle}
            >
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  From: {entity.name}
                </option>
              ))}
            </select>

            <select value={toEntityId} onChange={(e) => setToEntityId(e.target.value)} style={inputStyle}>
              {validCounterpartyChoices.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  To: {entity.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              style={inputStyle}
            />
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Memo / reason for the intercompany move"
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <input
              value={fromCashAccount}
              onChange={(e) => setFromCashAccount(e.target.value)}
              placeholder="Origin cash account"
              style={inputStyle}
            />
            <input
              value={toCashAccount}
              onChange={(e) => setToCashAccount(e.target.value)}
              placeholder="Destination cash account"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSettlementMode('mirrored_halves')}
              style={buttonStyle}
            >
              Mirrored Halves
            </button>
            <button
              type="button"
              onClick={() => setSettlementMode('cross_entity_clearing')}
              style={buttonStyle}
            >
              Cross-Entity Clearing
            </button>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'rgba(15,23,42,0.45)',
              border: '1px solid rgba(148,163,184,0.18)',
              color: '#cbd5e1',
              lineHeight: 1.6,
              fontSize: 13,
            }}
          >
            {settlementMode === 'mirrored_halves'
              ? 'Each entity keeps its own half of the move: the sender posts due-from and cash out, the receiver posts cash in and due-to.'
              : 'Cross-entity clearing is explicitly allowed for this move, but both halves are still created so the books remain traceable.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Close
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                fromEntityId,
                toEntityId,
                amount,
                effectiveDate,
                memo,
                settlementMode,
                fromCashAccount,
                toCashAccount,
              })
            }
            style={buttonStyle}
          >
            Post Intercompany Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
