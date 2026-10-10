import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  EntityRecord,
  InterEntityMovementType,
  NegotiableInstrumentRegisterRecord,
} from '../../types/core';
import type { InterEntityTransferSubmitPayload } from './accountingTypes';

interface InterEntityTransferModalProps {
  open: boolean;
  entities: EntityRecord[];
  negotiableInstrumentRegisters: NegotiableInstrumentRegisterRecord[];
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
  width: 'min(820px, 100%)',
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

const buttonStyle = (active = false): CSSProperties => ({
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: active ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.25)',
  background: active ? 'rgba(37,99,235,0.24)' : 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: active ? 700 : 600,
});

const movementCopy: Record<InterEntityMovementType, string> = {
  cash_transfer:
    'Actual cash movement. ClearFlow posts both sides as pending bank confirmation so cash is not treated as settled until bank activity confirms it.',
  internal_credit:
    'Non-cash internal credit or reserve bridge. ClearFlow posts due-from / due-to and credit-rail exposure without increasing bank cash.',
  note_instrument:
    'Issue a new inter-entity promissory note or assign an existing note to another controlled entity. Holder history is preserved without treating the note as cash.',
};

export default function InterEntityTransferModal({
  open,
  entities,
  negotiableInstrumentRegisters,
  onClose,
  onSubmit,
}: InterEntityTransferModalProps) {
  const [fromEntityId, setFromEntityId] = useState('');
  const [toEntityId, setToEntityId] = useState('');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [memo, setMemo] = useState('');
  const [movementType, setMovementType] =
    useState<InterEntityMovementType>('cash_transfer');
  const [settlementMode, setSettlementMode] = useState<
    'mirrored_halves' | 'cross_entity_clearing'
  >('mirrored_halves');
  const [fromCashAccount, setFromCashAccount] = useState('1000 Operating Cash');
  const [toCashAccount, setToCashAccount] = useState('1000 Operating Cash');
  const [reserveBacked, setReserveBacked] = useState(false);
  const [noteAction, setNoteAction] = useState<'issue_new' | 'assign_existing'>('issue_new');
  const [existingRegisterId, setExistingRegisterId] = useState('');
  const [noteMaturityDate, setNoteMaturityDate] = useState('');
  const [noteInterestRate, setNoteInterestRate] = useState('');

  const eligibleRegisters = useMemo(
    () =>
      negotiableInstrumentRegisters.filter(
        (register) =>
          register.currentHolderEntityId === fromEntityId &&
          register.outstandingAmount > 0 &&
          register.status !== 'retired' &&
          register.status !== 'performed',
      ),
    [fromEntityId, negotiableInstrumentRegisters],
  );

  useEffect(() => {
    if (!open) return;

    const defaultFrom = entities[0]?.id ?? '';
    const defaultTo = entities[1]?.id ?? entities[0]?.id ?? '';

    setFromEntityId(defaultFrom);
    setToEntityId(defaultTo);
    setAmount('');
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setMemo('');
    setMovementType('cash_transfer');
    setSettlementMode('mirrored_halves');
    setFromCashAccount('1000 Operating Cash');
    setToCashAccount('1000 Operating Cash');
    setReserveBacked(false);
    setNoteAction('issue_new');
    setExistingRegisterId('');
    setNoteMaturityDate('');
    setNoteInterestRate('');
  }, [open, entities]);

  useEffect(() => {
    if (!open || movementType !== 'note_instrument' || noteAction !== 'assign_existing') {
      return;
    }

    const selected = eligibleRegisters.find((register) => register.id === existingRegisterId);
    const next = selected ?? eligibleRegisters[0];

    if (!next) {
      setExistingRegisterId('');
      setAmount('');
      return;
    }

    if (next.id !== existingRegisterId) {
      setExistingRegisterId(next.id);
    }
    setAmount(String(next.outstandingAmount));
  }, [
    open,
    movementType,
    noteAction,
    eligibleRegisters,
    existingRegisterId,
  ]);

  if (!open) return null;

  const validCounterpartyChoices = entities.filter((entity) => entity.id !== fromEntityId);
  const isNoteAssignment =
    movementType === 'note_instrument' && noteAction === 'assign_existing';
  const selectedRegister = eligibleRegisters.find(
    (register) => register.id === existingRegisterId,
  );
  const canSubmit =
    Boolean(fromEntityId) &&
    Boolean(toEntityId) &&
    fromEntityId !== toEntityId &&
    Number(amount) > 0 &&
    (!isNoteAssignment || Boolean(selectedRegister));

  const fromLabel =
    movementType === 'note_instrument' && noteAction === 'issue_new'
      ? 'Issuer / Debtor'
      : movementType === 'note_instrument'
        ? 'Current Holder'
        : movementType === 'internal_credit'
          ? 'Credit Provider'
          : 'From';
  const toLabel =
    movementType === 'note_instrument' && noteAction === 'issue_new'
      ? 'Initial Holder / Creditor'
      : movementType === 'note_instrument'
        ? 'New Holder'
        : movementType === 'internal_credit'
          ? 'Credit Recipient'
          : 'To';

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Intercompany Movement</div>
          <div style={{ color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
            Keep cash, internal credit, and transferable notes separate so non-cash value never
            inflates bank cash.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
            Movement type
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setMovementType('cash_transfer')}
              style={buttonStyle(movementType === 'cash_transfer')}
            >
              Cash Transfer
            </button>
            <button
              type="button"
              onClick={() => setMovementType('internal_credit')}
              style={buttonStyle(movementType === 'internal_credit')}
            >
              Internal Credit / Reserve Bridge
            </button>
            <button
              type="button"
              onClick={() => setMovementType('note_instrument')}
              style={buttonStyle(movementType === 'note_instrument')}
            >
              Note / Instrument
            </button>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'rgba(15,23,42,0.45)',
              border: '1px solid rgba(148,163,184,0.18)',
              color: '#cbd5e1',
              lineHeight: 1.55,
              fontSize: 13,
            }}
          >
            {movementCopy[movementType]}
          </div>
        </div>

        {movementType === 'note_instrument' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
              Note action
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setNoteAction('issue_new');
                  setExistingRegisterId('');
                  setAmount('');
                }}
                style={buttonStyle(noteAction === 'issue_new')}
              >
                Issue New Note
              </button>
              <button
                type="button"
                onClick={() => setNoteAction('assign_existing')}
                style={buttonStyle(noteAction === 'assign_existing')}
              >
                Assign Existing Note
              </button>
            </div>
          </div>
        ) : null}

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
                if (noteAction === 'assign_existing') {
                  setExistingRegisterId('');
                }
              }}
              style={inputStyle}
            >
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {fromLabel}: {entity.name}
                </option>
              ))}
            </select>

            <select
              value={toEntityId}
              onChange={(e) => setToEntityId(e.target.value)}
              style={inputStyle}
            >
              {validCounterpartyChoices.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {toLabel}: {entity.name}
                </option>
              ))}
            </select>
          </div>

          {isNoteAssignment ? (
            <select
              value={existingRegisterId}
              onChange={(e) => {
                const nextId = e.target.value;
                setExistingRegisterId(nextId);
                const next = eligibleRegisters.find((register) => register.id === nextId);
                setAmount(next ? String(next.outstandingAmount) : '');
              }}
              style={inputStyle}
            >
              {eligibleRegisters.length === 0 ? (
                <option value="">No movable notes held by this entity</option>
              ) : null}
              {eligibleRegisters.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.registerLabel} · {register.legalIdentifier} · $
                  {register.outstandingAmount.toLocaleString()}
                </option>
              ))}
            </select>
          ) : null}

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
              placeholder={isNoteAssignment ? 'Full outstanding note amount' : 'Amount'}
              style={{ ...inputStyle, opacity: isNoteAssignment ? 0.72 : 1 }}
              disabled={isNoteAssignment}
            />
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {movementType === 'note_instrument' && noteAction === 'issue_new' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <input
                type="date"
                value={noteMaturityDate}
                onChange={(e) => setNoteMaturityDate(e.target.value)}
                style={inputStyle}
                aria-label="Note maturity date"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={noteInterestRate}
                onChange={(e) => setNoteInterestRate(e.target.value)}
                placeholder="Interest rate % (optional)"
                style={inputStyle}
              />
            </div>
          ) : null}

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={
              movementType === 'note_instrument'
                ? 'Note purpose / assignment memo'
                : 'Memo / reason for the intercompany move'
            }
            style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
          />

          {movementType === 'cash_transfer' ? (
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
          ) : null}

          {movementType === 'internal_credit' ||
          (movementType === 'note_instrument' && noteAction === 'issue_new') ? (
            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.2)',
                color: '#cbd5e1',
              }}
            >
              <input
                type="checkbox"
                checked={reserveBacked}
                onChange={(e) => setReserveBacked(e.target.checked)}
              />
              Mark this movement as reserve-backed
            </label>
          ) : null}

          {movementType !== 'note_instrument' ? (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setSettlementMode('mirrored_halves')}
                  style={buttonStyle(settlementMode === 'mirrored_halves')}
                >
                  Mirrored Halves
                </button>
                <button
                  type="button"
                  onClick={() => setSettlementMode('cross_entity_clearing')}
                  style={buttonStyle(settlementMode === 'cross_entity_clearing')}
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
                  ? 'Each entity keeps its own independent accounting half. No side is silently netted away.'
                  : 'Cross-entity clearing is allowed, but both entity records remain independently traceable.'}
              </div>
            </>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle()}>
            Close
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                fromEntityId,
                toEntityId,
                amount,
                effectiveDate,
                memo,
                movementType,
                settlementMode,
                fromCashAccount,
                toCashAccount,
                reserveBacked,
                noteAction,
                existingRegisterId: existingRegisterId || undefined,
                noteMaturityDate: noteMaturityDate || undefined,
                noteInterestRate: noteInterestRate || undefined,
              })
            }
            style={{
              ...buttonStyle(true),
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {movementType === 'cash_transfer'
              ? 'Post Cash Movement'
              : movementType === 'internal_credit'
                ? 'Post Internal Credit'
                : noteAction === 'assign_existing'
                  ? 'Assign Note'
                  : 'Issue Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
