import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  BankAccountRecord,
  BillRecord,
  CustomerRecord,
  DigitalAssetRecord,
  InvoiceRecord,
  LedgerAccountRecord,
  TreasuryAccountRecord,
  VendorRecord,
  WalletRecord,
} from '../../types/core';
import type { PaymentSubmitPayload } from './accountingTypes';

type PaymentMethod =
  'ach'
  | 'wire'
  | 'check'
  | 'card'
  | 'cash'
  | 'digital_asset'
  | 'other';

type DischargeMethod =
  | 'internal_ledger_credit'
  | 'instrument_performance'
  | 'bank_rail_payment'
  | 'mixed_discharge';

interface PaymentRecordModalProps {
  open: boolean;
  customers: CustomerRecord[];
  vendors: VendorRecord[];
  invoices: InvoiceRecord[];
  bills: BillRecord[];
  bankAccounts: BankAccountRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  wallets: WalletRecord[];
  digitalAssets: DigitalAssetRecord[];
  onClose: () => void;
  onSubmit: (payload: PaymentSubmitPayload) => void;
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
  width: 'min(840px, 100%)',
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

export default function PaymentRecordModal({
  open,
  customers,
  vendors,
  invoices,
  bills,
  bankAccounts,
  ledgerAccounts,
  treasuryAccounts,
  wallets,
  digitalAssets,
  onClose,
  onSubmit,
}: PaymentRecordModalProps) {
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('ach');
  const [linkedInvoiceId, setLinkedInvoiceId] = useState('');
  const [linkedBillId, setLinkedBillId] = useState('');
  const [sourceBankAccountId, setSourceBankAccountId] = useState('');
  const [sourceLedgerAccountId, setSourceLedgerAccountId] = useState('');
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [linkedWalletId, setLinkedWalletId] = useState('');
  const [linkedDigitalAssetId, setLinkedDigitalAssetId] = useState('');
  const [dischargeMethod, setDischargeMethod] =
    useState<DischargeMethod>('bank_rail_payment');
  const [urgency, setUrgency] = useState<'instant' | 'same_day' | 'standard' | 'final'>(
    'standard'
  );
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setDirection('incoming');
    setCounterpartyId('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setMethod('ach');
    setLinkedInvoiceId('');
    setLinkedBillId('');
    setSourceBankAccountId('');
    setSourceLedgerAccountId('');
    setTreasuryAccountId('');
    setLinkedWalletId('');
    setLinkedDigitalAssetId('');
    setDischargeMethod('bank_rail_payment');
    setUrgency('standard');
    setNotes('');
  }, [open]);

  useEffect(() => {
    if (method === 'digital_asset' && dischargeMethod === 'bank_rail_payment') {
      setDischargeMethod('mixed_discharge');
    }
  }, [dischargeMethod, method]);

  const counterpartyOptions = useMemo(
    () => (direction === 'incoming' ? customers : vendors),
    [customers, direction, vendors]
  );

  const documentOptions = useMemo(
    () =>
      direction === 'incoming'
        ? invoices.filter((item) => item.balanceDue > 0)
        : bills.filter((item) => item.balanceDue > 0),
    [bills, direction, invoices]
  );

  const selectedVendor = useMemo(
    () =>
      direction === 'outgoing'
        ? vendors.find((record) => record.id === counterpartyId)
        : undefined,
    [counterpartyId, direction, vendors]
  );

  const bankAccountOptions = useMemo(
    () => bankAccounts.filter((record) => record.status === 'active'),
    [bankAccounts]
  );

  const ledgerFundingOptions = useMemo(
    () =>
      ledgerAccounts.filter(
        (record) =>
          record.remittanceEligible ||
          record.remittanceClassification === 'cash' ||
          record.remittanceClassification === 'obligation'
      ),
    [ledgerAccounts]
  );

  const treasuryOptions = useMemo(
    () =>
      treasuryAccounts.filter(
        (record) => record.status === 'active' && record.remittanceEnabled
      ),
    [treasuryAccounts]
  );

  const connectedWalletOptions = useMemo(
    () => wallets.filter((record) => record.connectionStatus !== 'disconnected'),
    [wallets]
  );

  const selectedWallet = useMemo(
    () => wallets.find((record) => record.id === linkedWalletId),
    [linkedWalletId, wallets]
  );

  const digitalAssetOptions = useMemo(() => {
    if (!linkedWalletId) {
      return digitalAssets;
    }

    return digitalAssets.filter((record) => record.walletId === linkedWalletId);
  }, [digitalAssets, linkedWalletId]);

  const selectedDigitalAsset = useMemo(
    () => digitalAssets.find((record) => record.id === linkedDigitalAssetId),
    [digitalAssets, linkedDigitalAssetId]
  );

  const vendorInstructionReady =
    method === 'digital_asset'
      ? Boolean(selectedVendor?.paymentInstructions?.digitalWalletAddress)
      : Boolean(
          (selectedVendor?.paymentInstructions?.routingMask ||
            selectedVendor?.paymentInstructions?.routingNumber) &&
            selectedVendor?.paymentInstructions?.accountMask
        );

  const requiresSettlementExecution =
    direction === 'outgoing' &&
    (method === 'ach' || method === 'wire') &&
    Boolean(counterpartyId);

  const showSettlementControls =
    requiresSettlementExecution ||
    method === 'digital_asset' ||
    treasuryOptions.length > 0;

  useEffect(() => {
    if (method !== 'digital_asset' || !selectedVendor) {
      return;
    }

    const preferredSymbol = selectedVendor.paymentInstructions?.digitalAssetSymbol?.toUpperCase();
    const preferredNetwork = selectedVendor.paymentInstructions?.digitalWalletNetwork;

    if (!linkedDigitalAssetId && preferredSymbol) {
      const suggestedAsset = digitalAssets.find(
        (asset) =>
          asset.symbol?.toUpperCase() === preferredSymbol &&
          (!preferredNetwork || asset.network === preferredNetwork)
      );

      if (suggestedAsset) {
        setLinkedDigitalAssetId(suggestedAsset.id);
        if (suggestedAsset.walletId) {
          setLinkedWalletId((current) => current || suggestedAsset.walletId || '');
        }
      }
    }
  }, [
    digitalAssets,
    linkedDigitalAssetId,
    method,
    selectedVendor,
  ]);

  useEffect(() => {
    if (method !== 'digital_asset' || !selectedDigitalAsset?.walletId) {
      return;
    }

    if (!linkedWalletId) {
      setLinkedWalletId(selectedDigitalAsset.walletId);
    }
  }, [linkedWalletId, method, selectedDigitalAsset]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Record Payment</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Post incoming collections or outgoing disbursements and route them through bank,
            treasury, or wallet settlement controls.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <select
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as 'incoming' | 'outgoing')
            }
            style={inputStyle}
          >
            <option value="incoming">Incoming payment</option>
            <option value="outgoing">Outgoing payment</option>
          </select>
          <select
            value={counterpartyId}
            onChange={(event) => setCounterpartyId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Select {direction === 'incoming' ? 'customer' : 'vendor'}</option>
            {counterpartyOptions.map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            style={inputStyle}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Amount"
            style={inputStyle}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            style={inputStyle}
          >
            <option value="ach">ACH</option>
            <option value="wire">Wire</option>
            <option value="check">Check</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="digital_asset">Digital asset</option>
            <option value="other">Other</option>
          </select>
          {direction === 'incoming' ? (
            <select
              value={linkedInvoiceId}
              onChange={(event) => setLinkedInvoiceId(event.target.value)}
              style={inputStyle}
            >
              <option value="">Apply to open invoice</option>
              {documentOptions.map((record) => (
                <option key={record.id} value={record.id}>
                  {(record as InvoiceRecord).invoiceNumber} - {(record as InvoiceRecord).balanceDue}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={linkedBillId}
              onChange={(event) => setLinkedBillId(event.target.value)}
              style={inputStyle}
            >
              <option value="">Apply to open bill</option>
              {documentOptions.map((record) => (
                <option key={record.id} value={record.id}>
                  {(record as BillRecord).billNumber || record.id} - {(record as BillRecord).balanceDue}
                </option>
              ))}
            </select>
          )}
          <select
            value={dischargeMethod}
            onChange={(event) =>
              setDischargeMethod(event.target.value as DischargeMethod)
            }
            style={inputStyle}
          >
            <option value="bank_rail_payment">Bank rail payment</option>
            <option value="internal_ledger_credit">Internal ledger credit</option>
            <option value="instrument_performance">Instrument performance</option>
            <option value="mixed_discharge">Mixed discharge</option>
          </select>
          <select
            value={urgency}
            onChange={(event) => setUrgency(event.target.value as typeof urgency)}
            style={inputStyle}
          >
            <option value="standard">Standard</option>
            <option value="same_day">Same day</option>
            <option value="instant">Instant</option>
            <option value="final">Final</option>
          </select>
        </div>

        {showSettlementControls ? (
          <div
            style={{
              display: 'grid',
              gap: 12,
              padding: 14,
              borderRadius: 12,
              border: '1px solid rgba(56,189,248,0.25)',
              background: 'rgba(8,47,73,0.28)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7dd3fc' }}>
              Settlement source, treasury, and verification
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 13 }}>
              Route the payment through a connected bank, a remittance-ready ledger account, or a
              treasury-linked wallet when digital assets are being used.
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <select
                value={sourceBankAccountId}
                onChange={(event) => {
                  setSourceBankAccountId(event.target.value);
                  if (event.target.value) {
                    setSourceLedgerAccountId('');
                  }
                }}
                style={inputStyle}
              >
                <option value="">Use bank account if connected</option>
                {bankAccountOptions.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.accountName} - {record.institutionName} - {record.last4 || 'manual'}
                  </option>
                ))}
              </select>
              <select
                value={sourceLedgerAccountId}
                onChange={(event) => {
                  setSourceLedgerAccountId(event.target.value);
                  if (event.target.value) {
                    setSourceBankAccountId('');
                  }
                }}
                style={inputStyle}
              >
                <option value="">Use ledger remittance source</option>
                {ledgerFundingOptions.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} - {record.name} - {record.remittanceClassification || 'ledger'}
                  </option>
                ))}
              </select>
              <select
                value={treasuryAccountId}
                onChange={(event) => setTreasuryAccountId(event.target.value)}
                style={inputStyle}
              >
                <option value="">Use treasury reserve / clearing account</option>
                {treasuryOptions.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name} - {record.treasuryType}
                  </option>
                ))}
              </select>
            </div>

            {method === 'digital_asset' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <select
                  value={linkedWalletId}
                  onChange={(event) => {
                    setLinkedWalletId(event.target.value);
                    setLinkedDigitalAssetId('');
                  }}
                  style={inputStyle}
                >
                  <option value="">Select connected wallet</option>
                  {connectedWalletOptions.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name} - {record.network}
                    </option>
                  ))}
                </select>
                <select
                  value={linkedDigitalAssetId}
                  onChange={(event) => setLinkedDigitalAssetId(event.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select digital asset</option>
                  {digitalAssetOptions.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.symbol || record.name} - {record.network || 'digital'}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    minHeight: 44,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(45,212,191,0.28)',
                    background: 'rgba(15,118,110,0.18)',
                    color: '#d1fae5',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {selectedWallet
                    ? selectedWallet.executionSupport === 'live_broadcast'
                      ? `Wallet ${selectedWallet.name} is live-broadcast ready for on-chain settlement.`
                      : selectedWallet.executionSupport === 'manual_release'
                        ? `Wallet ${selectedWallet.name} will anchor proof and controlled release, but final settlement still requires manual chain confirmation on this network/provider.`
                        : `Wallet ${selectedWallet.name} is currently read-only for payout execution and will stay in controlled queue mode.`
                    : 'Pick a connected wallet to create the on-chain settlement record.'}
                </div>
              </div>
            ) : null}

            {method === 'digital_asset' && selectedVendor ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(56,189,248,0.25)',
                  background: 'rgba(8,47,73,0.24)',
                  color: '#dbeafe',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Preferred payout profile:{' '}
                {selectedVendor.paymentInstructions?.digitalPayoutTemplate || 'stablecoin'} |{' '}
                {selectedVendor.paymentInstructions?.digitalAssetSymbol || 'asset not set'} |{' '}
                {selectedVendor.paymentInstructions?.digitalWalletNetwork || 'network not set'}
                {selectedDigitalAsset
                  ? ` | matched asset: ${selectedDigitalAsset.symbol || selectedDigitalAsset.name}`
                  : preferredSymbolMissing(selectedVendor)
                    ? ' | add a preferred asset symbol to auto-match treasury liquidity'
                    : ''}
              </div>
            ) : null}

            {direction === 'outgoing' ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: vendorInstructionReady
                    ? '1px solid rgba(45,212,191,0.3)'
                    : '1px solid rgba(251,191,36,0.28)',
                  background: vendorInstructionReady
                    ? 'rgba(15,118,110,0.18)'
                    : 'rgba(120,53,15,0.2)',
                  color: '#e2e8f0',
                  fontSize: 13,
                }}
              >
                  {selectedVendor ? (
                  vendorInstructionReady ? (
                    <>
                      {method === 'digital_asset'
                        ? `Ready to route to ${
                            selectedVendor.paymentInstructions?.digitalWalletAddress
                          } on ${
                            selectedVendor.paymentInstructions?.digitalWalletNetwork || 'the selected network'
                          }${selectedVendor.paymentInstructions?.digitalAssetSymbol ? ` using ${selectedVendor.paymentInstructions.digitalAssetSymbol}` : ''}.`
                        : `Ready to route to ${
                            selectedVendor.paymentInstructions?.beneficiaryName || selectedVendor.name
                          } - ${selectedVendor.paymentInstructions?.bankName || 'bank on file'} - acct ${
                            selectedVendor.paymentInstructions?.accountMask
                          }`}
                    </>
                  ) : method === 'digital_asset' ? (
                    'Vendor wallet instructions are missing. Add the payee wallet address and network to move this digital-asset settlement into live execution.'
                  ) : (
                    'Vendor remittance instructions are missing or incomplete. The payment can still be recorded, but settlement will stay in review until routing and account details are entered.'
                  )
                ) : (
                  'Select a vendor to see remittance readiness.'
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Remittance / memo"
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Close
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                direction,
                counterpartyType: direction === 'incoming' ? 'customer' : 'vendor',
                counterpartyId: counterpartyId || undefined,
                paymentDate,
                amount,
                method,
                sourceBankAccountId: sourceBankAccountId || undefined,
                sourceLedgerAccountId: sourceLedgerAccountId || undefined,
                treasuryAccountId: treasuryAccountId || undefined,
                linkedWalletId: linkedWalletId || undefined,
                linkedDigitalAssetId: linkedDigitalAssetId || undefined,
                dischargeMethod,
                urgency,
                linkedInvoiceId: linkedInvoiceId || undefined,
                linkedBillId: linkedBillId || undefined,
                notes,
              })
            }
            style={buttonStyle}
          >
            Post Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function preferredSymbolMissing(vendor?: VendorRecord) {
  return !vendor?.paymentInstructions?.digitalAssetSymbol;
}
