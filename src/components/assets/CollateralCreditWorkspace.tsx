import { useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import type {
  CollateralCreditProviderType,
  CoreDataBundle,
} from '../../types/core';

interface CollateralCreditWorkspaceProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 9,
  border: '1px solid rgba(148,163,184,0.24)',
  background: 'rgba(15,23,42,0.46)',
  color: '#e5e7eb',
  padding: '10px 12px',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 9,
  border: '1px solid rgba(96,165,250,0.42)',
  background: 'rgba(37,99,235,0.22)',
  color: '#e5e7eb',
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
};

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export default function CollateralCreditWorkspace({
  data,
  setData,
}: CollateralCreditWorkspaceProps) {
  const [entityId, setEntityId] = useState(data.entities[0]?.id || '');
  const [collateralHoldingId, setCollateralHoldingId] = useState('');
  const [providerType, setProviderType] =
    useState<CollateralCreditProviderType>('commercial_bank');
  const [lenderName, setLenderName] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [destinationBankAccountId, setDestinationBankAccountId] = useState('');
  const [bankFeedEntryId, setBankFeedEntryId] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [notice, setNotice] = useState('');

  const holdings = useMemo(
    () => data.collateralHoldings.filter((holding) => holding.entityId === entityId),
    [data.collateralHoldings, entityId],
  );

  const bankAccounts = useMemo(
    () => data.bankAccounts.filter((account) => account.entityId === entityId && account.status === 'active'),
    [data.bankAccounts, entityId],
  );

  const confirmingCredits = useMemo(
    () =>
      data.bankFeedEntries.filter(
        (entry) =>
          entry.entityId === entityId &&
          entry.direction === 'credit' &&
          (!destinationBankAccountId || entry.bankAccountId === destinationBankAccountId) &&
          entry.verificationStatus === 'verified',
      ),
    [data.bankFeedEntries, destinationBankAccountId, entityId],
  );

  const resetConfirmation = () => {
    setBankFeedEntryId('');
    setExternalReference('');
  };

  const handleRecord = () => {
    const holding = data.collateralHoldings.find(
      (item) => item.id === collateralHoldingId && item.entityId === entityId,
    );
    if (!holding) {
      setNotice('Choose the collateral holding being pledged.');
      return;
    }

    const amount = Number(requestedAmount || holding.lendableValue || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Enter the requested or expected credit amount.');
      return;
    }

    const feedCredit = bankFeedEntryId
      ? data.bankFeedEntries.find(
          (entry) =>
            entry.id === bankFeedEntryId &&
            entry.entityId === entityId &&
            entry.direction === 'credit' &&
            entry.verificationStatus === 'verified',
        )
      : undefined;

    if (feedCredit && Math.abs(feedCredit.amount) + 0.005 < amount) {
      setNotice(
        `The selected verified bank credit is only ${money(Math.abs(feedCredit.amount))}. Lower the draw amount or choose the matching credit.`,
      );
      return;
    }

    const stamp = Date.now();
    const facilityId = `facility-collateral-${stamp}`;
    const today = new Date().toISOString().slice(0, 10);
    const cashConfirmed = Boolean(feedCredit);
    const destinationBank = bankAccounts.find((account) => account.id === destinationBankAccountId);
    const journalId = cashConfirmed ? `je-collateral-credit-${stamp}` : undefined;

    setData((prev) => ({
      ...prev,
      borrowingFacilities: [
        {
          id: facilityId,
          entityId,
          facilityName:
            `${lenderName.trim() || (providerType === 'federal_reserve_via_eligible_depository'
              ? 'Eligible Depository Institution'
              : 'Collateral Lender')} secured collateral facility`,
          facilityType: 'secured_margin',
          status: 'active',
          lenderName: lenderName.trim() || undefined,
          providerType,
          creditStatus: cashConfirmed ? 'cash_confirmed' : 'pending_external_credit',
          externalConfirmationReference:
            cashConfirmed
              ? feedCredit?.externalTransactionId || externalReference.trim() || undefined
              : externalReference.trim() || undefined,
          destinationBankAccountId: destinationBankAccountId || undefined,
          confirmedCashDate: cashConfirmed ? feedCredit?.postedDate || today : undefined,
          currency: 'USD',
          commitmentAmount: amount,
          drawnAmount: cashConfirmed ? amount : 0,
          availableAmount: cashConfirmed ? 0 : amount,
          collateralRequirement: `Secured by ${holding.holdingLabel}.`,
          linkedCollateralHoldingIds: [holding.id],
          linkedLedgerAccountId: destinationBank?.linkedLedgerAccountId,
          notes:
            providerType === 'federal_reserve_via_eligible_depository'
              ? 'Federal Reserve-related collateral credit is recorded only through an eligible depository institution. ClearFlow does not represent the company or trust as having direct Discount Window access. Cash is recognized only after a verified external bank credit is matched.'
              : 'Collateral pledge recorded separately from cash. Cash is recognized only after a verified external bank credit is matched.',
        },
        ...(prev.borrowingFacilities ?? []),
      ],
      collateralHoldings: prev.collateralHoldings.map((item) =>
        item.id === holding.id
          ? {
              ...item,
              status: 'pledged',
              pledgeeName: lenderName.trim() || undefined,
              pledgeProviderType: providerType,
              externalPledgeReference: externalReference.trim() || undefined,
              cashCreditStatus: cashConfirmed ? 'cash_confirmed' : 'pending_external_credit',
              linkedBorrowingFacilityId: facilityId,
            }
          : item,
      ),
      journalEntries:
        cashConfirmed && journalId
          ? [
              {
                id: journalId,
                entityId,
                entryNumber: `JE-COLL-${String(stamp).slice(-7)}`,
                entryDate: feedCredit?.postedDate || today,
                memo: `Recognize externally confirmed collateral-backed cash credit from ${lenderName.trim() || 'lender'}`,
                debitAccount: destinationBank?.linkedLedgerAccountId
                  ? `${destinationBank.linkedLedgerAccountId} Bank Cash`
                  : destinationBank?.accountName || '1000 Operating Cash',
                creditAccount: '2600 Secured Borrowing / Collateral Credit Payable',
                amount,
                status: 'posted',
                source: 'system',
                linkedTransactionIds: feedCredit?.linkedTransactionId
                  ? [feedCredit.linkedTransactionId]
                  : undefined,
                autoReconcileStatus: feedCredit?.status === 'reconciled' ? 'matched' : 'pending',
                verificationRequired: true,
              },
              ...(prev.journalEntries ?? []),
            ]
          : prev.journalEntries,
    }));

    setNotice(
      cashConfirmed
        ? `Recorded ${money(amount)} of externally confirmed collateral-backed cash credit. The cash recognition is tied to verified bank-feed credit ${feedCredit?.externalTransactionId || feedCredit?.id}.`
        : `Recorded the collateral pledge and requested ${money(amount)} credit capacity. No cash was created because no verified bank credit has been matched yet.`,
    );
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          padding: 14,
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(15,23,42,0.35)',
          color: '#cbd5e1',
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        Record the pledge first. A collateral deposit, lendable value, or internal valuation does
        not become cash by itself. Cash is recognized only when an actual lender/bank credit is
        independently verified and matched.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        <select
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value);
            setCollateralHoldingId('');
            setDestinationBankAccountId('');
            resetConfirmation();
          }}
          style={inputStyle}
        >
          {data.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.displayName || entity.name}
            </option>
          ))}
        </select>

        <select
          value={collateralHoldingId}
          onChange={(e) => setCollateralHoldingId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Choose collateral holding</option>
          {holdings.map((holding) => (
            <option key={holding.id} value={holding.id}>
              {holding.holdingLabel} · {money(holding.lendableValue ?? holding.marketValue)}
            </option>
          ))}
        </select>

        <select
          value={providerType}
          onChange={(e) => {
            setProviderType(e.target.value as CollateralCreditProviderType);
            resetConfirmation();
          }}
          style={inputStyle}
        >
          <option value="commercial_bank">Commercial bank / lender</option>
          <option value="federal_reserve_via_eligible_depository">
            Federal Reserve via eligible depository institution
          </option>
          <option value="custodian_repo">Custodian / repo facility</option>
          <option value="other">Other verified lender</option>
        </select>

        <input
          value={lenderName}
          onChange={(e) => setLenderName(e.target.value)}
          placeholder="Lender / depository institution"
          style={inputStyle}
        />

        <input
          type="number"
          min="0"
          step="0.01"
          value={requestedAmount}
          onChange={(e) => setRequestedAmount(e.target.value)}
          placeholder="Requested / expected cash credit"
          style={inputStyle}
        />

        <select
          value={destinationBankAccountId}
          onChange={(e) => {
            setDestinationBankAccountId(e.target.value);
            setBankFeedEntryId('');
          }}
          style={inputStyle}
        >
          <option value="">Destination bank account (optional until funded)</option>
          {bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.institutionName} · {account.accountName} · {account.last4 || 'no last4'}
            </option>
          ))}
        </select>

        <select
          value={bankFeedEntryId}
          onChange={(e) => setBankFeedEntryId(e.target.value)}
          style={inputStyle}
        >
          <option value="">No verified cash credit yet</option>
          {confirmingCredits.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.postedDate} · {money(Math.abs(entry.amount))} · {entry.description}
            </option>
          ))}
        </select>

        <input
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value)}
          placeholder="Pledge / lender reference (does not prove cash)"
          style={inputStyle}
        />
      </div>

      {providerType === 'federal_reserve_via_eligible_depository' ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(251,191,36,0.3)',
            background: 'rgba(120,53,15,0.16)',
            color: '#fde68a',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          Federal Reserve Discount Window collateral is pledged by eligible depository
          institutions. ClearFlow therefore records your company/trust collateral relationship
          through the actual bank/depository counterparty and does not label the company or trust
          itself as a Federal Reserve borrower.
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleRecord} style={buttonStyle}>
          Record Collateral Credit Position
        </button>
        {notice ? <div style={{ color: '#cbd5e1', fontSize: 13 }}>{notice}</div> : null}
      </div>
    </div>
  );
}
