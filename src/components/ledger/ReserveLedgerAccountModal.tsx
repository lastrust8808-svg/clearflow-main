import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import type {
  AssetRecord,
  CoreDataBundle,
  LedgerAccountRecord,
  WalletRecord,
} from '../../types/core';

interface ReserveLedgerAccountModalProps {
  open: boolean;
  account: LedgerAccountRecord | null;
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
  onClose: () => void;
}

type QuickAddType = 'ucc' | 'note' | 'metal' | 'wallet';

interface QuickAddDraft {
  type: QuickAddType;
  name: string;
  reference: string;
  value: string;
  debtorName: string;
  securedParty: string;
  jurisdiction: string;
  issuerName: string;
  issueDate: string;
  maturityDate: string;
  metalType: AssetRecord['preciousMetalProfile'] extends { metalType?: infer T } ? T : string;
  quantity: string;
  unitOfMeasure: AssetRecord['preciousMetalProfile'] extends { unitOfMeasure?: infer T } ? T : string;
  storageLocation: string;
  itemIdentifiers: string;
  walletName: string;
  network: string;
  address: string;
  custodyType: WalletRecord['custodyType'];
  provider: WalletRecord['connectionProvider'];
  assetName: string;
  assetSymbol: string;
  assetQuantity: string;
  assetValue: string;
}

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(10, 16, 30, 0.82)',
  color: '#f8fafc',
  padding: '10px 12px',
  boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  color: '#cbd5e1',
};

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildEmptyDraft(): QuickAddDraft {
  return {
    type: 'ucc',
    name: '',
    reference: '',
    value: '',
    debtorName: '',
    securedParty: '',
    jurisdiction: '',
    issuerName: '',
    issueDate: '',
    maturityDate: '',
    metalType: 'gold',
    quantity: '',
    unitOfMeasure: 'oz',
    storageLocation: '',
    itemIdentifiers: '',
    walletName: '',
    network: '',
    address: '',
    custodyType: 'self_custody',
    provider: 'manual',
    assetName: '',
    assetSymbol: '',
    assetQuantity: '',
    assetValue: '',
  };
}

export default function ReserveLedgerAccountModal({
  open,
  account,
  data,
  setData,
  onClose,
}: ReserveLedgerAccountModalProps) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<QuickAddDraft>(buildEmptyDraft);

  const entityAssets = useMemo(
    () =>
      account
        ? data.assets
            .filter((item) => item.entityId === account.entityId)
            .sort((left, right) => left.name.localeCompare(right.name))
        : [],
    [account, data.assets],
  );
  const entityWallets = useMemo(
    () =>
      account
        ? data.wallets
            .filter((item) => item.entityId === account.entityId)
            .sort((left, right) => left.name.localeCompare(right.name))
        : [],
    [account, data.wallets],
  );

  const linkedAssets = useMemo(() => {
    if (!account) {
      return [];
    }
    const selectedIds = new Set(selectedAssetIds);
    return data.assets.filter(
      (item) =>
        item.entityId === account.entityId &&
        (selectedIds.has(item.id) || item.linkedLedgerAccountId === account.id),
    );
  }, [account, data.assets, selectedAssetIds]);

  const linkedInstruments = useMemo(() => {
    const linkedAssetIds = new Set(linkedAssets.map((item) => item.id));
    if (!account || linkedAssetIds.size === 0) {
      return [];
    }
    return data.instruments.filter(
      (item) =>
        item.entityId === account.entityId &&
        Boolean(item.linkedAssetIds?.some((assetId) => linkedAssetIds.has(assetId))),
    );
  }, [account, data.instruments, linkedAssets]);

  useEffect(() => {
    if (!open || !account) {
      return;
    }

    const nextAssetIds = new Set(account.linkedAssetIds || []);
    const nextWalletIds = new Set(account.linkedWalletIds || []);

    data.assets.forEach((item) => {
      if (item.linkedLedgerAccountId === account.id) {
        nextAssetIds.add(item.id);
      }
    });
    data.wallets.forEach((item) => {
      if (item.linkedLedgerAccountId === account.id) {
        nextWalletIds.add(item.id);
      }
    });

    setSelectedAssetIds(Array.from(nextAssetIds));
    setSelectedWalletIds(Array.from(nextWalletIds));
    setDraft(buildEmptyDraft());
  }, [open, account, data.assets, data.wallets]);

  if (!open || !account) {
    return null;
  }

  const entityLabel =
    data.entities.find((item) => item.id === account.entityId)?.displayName || account.entityId;

  const updateDraft = <K extends keyof QuickAddDraft>(key: K, value: QuickAddDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleSelectedValue = (
    targetId: string,
    currentValues: string[],
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    setter((prev) =>
      prev.includes(targetId) ? prev.filter((item) => item !== targetId) : [...prev, targetId],
    );
  };

  const draftHasInput = (() => {
    switch (draft.type) {
      case 'ucc':
        return Boolean(
          draft.name.trim() ||
            draft.reference.trim() ||
            draft.debtorName.trim() ||
            draft.securedParty.trim() ||
            draft.value.trim(),
        );
      case 'note':
        return Boolean(
          draft.name.trim() ||
            draft.reference.trim() ||
            draft.issuerName.trim() ||
            draft.value.trim() ||
            draft.issueDate.trim() ||
            draft.maturityDate.trim(),
        );
      case 'metal':
        return Boolean(
          draft.name.trim() ||
            draft.quantity.trim() ||
            draft.value.trim() ||
            draft.storageLocation.trim() ||
            draft.itemIdentifiers.trim(),
        );
      case 'wallet':
        return Boolean(
          draft.walletName.trim() ||
            draft.network.trim() ||
            draft.address.trim() ||
            draft.assetName.trim() ||
            draft.assetSymbol.trim() ||
            draft.assetQuantity.trim() ||
            draft.assetValue.trim(),
        );
      default:
        return false;
    }
  })();

  const handleSave = () => {
    if (draftHasInput) {
      if (draft.type === 'note' && !draft.name.trim()) {
        alert('Enter a title for the note held before saving.');
        return;
      }
      if (draft.type === 'wallet' && (!draft.walletName.trim() || !draft.network.trim() || !draft.address.trim())) {
        alert('Enter wallet name, network, and address before saving a crypto wallet.');
        return;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const nextSelectedAssetIds = dedupe(selectedAssetIds);
    const nextSelectedWalletIds = dedupe(selectedWalletIds);

    setData((prev) => {
      let nextAssets = prev.assets;
      let nextWallets = prev.wallets;
      let nextDigitalAssets = prev.digitalAssets;
      let nextInstruments = prev.instruments;

      if (draftHasInput && draft.type === 'ucc') {
        const assetId = buildId('asset');
        const enteredValue = Number(draft.value || 0);
        nextAssets = [
          {
            id: assetId,
            entityId: account.entityId,
            name: draft.name.trim() || `UCC Filing ${draft.reference.trim() || today}`,
            category: 'other',
            status: 'active',
            bookValue: enteredValue,
            marketValue: enteredValue,
            paymentMedium: 'private_tender',
            identifierCode: draft.reference.trim() || undefined,
            linkedLedgerAccountId: account.id,
            notes: [
              'Reserve-side UCC / secured record added from ledger reserve setup.',
              draft.debtorName.trim() ? `Debtor: ${draft.debtorName.trim()}` : '',
              draft.securedParty.trim() ? `Secured party: ${draft.securedParty.trim()}` : '',
              draft.jurisdiction.trim() ? `Jurisdiction: ${draft.jurisdiction.trim()}` : '',
            ]
              .filter(Boolean)
              .join(' '),
          },
          ...nextAssets,
        ];
        nextSelectedAssetIds.push(assetId);
      }

      if (draftHasInput && draft.type === 'note') {
        const assetId = buildId('asset');
        const instrumentId = buildId('inst');
        const enteredValue = Number(draft.value || 0);
        nextAssets = [
          {
            id: assetId,
            entityId: account.entityId,
            name: draft.name.trim(),
            category: 'receivable',
            status: 'active',
            bookValue: enteredValue,
            marketValue: enteredValue,
            paymentMedium: 'private_tender',
            linkedLedgerAccountId: account.id,
            identifierCode: draft.reference.trim() || undefined,
            notes: 'Reserve-side note held asset created from the ledger reserve setup workspace.',
          },
          ...nextAssets,
        ];
        nextInstruments = [
          {
            id: instrumentId,
            entityId: account.entityId,
            title: draft.name.trim(),
            instrumentType: 'promissory_note',
            sourceClass: 'note',
            legalIdentifier: draft.reference.trim() || undefined,
            issuerName: draft.issuerName.trim() || undefined,
            issueDate: draft.issueDate.trim() || undefined,
            maturityDate: draft.maturityDate.trim() || undefined,
            denominationValue: enteredValue,
            paymentMedium: 'private_tender',
            reserveDepositEnabled: true,
            linkedAssetIds: [assetId],
            notes: 'Added from ledger reserve setup as a note held / reserve paper record.',
          },
          ...nextInstruments,
        ];
        nextSelectedAssetIds.push(assetId);
      }

      if (draftHasInput && draft.type === 'metal') {
        const assetId = buildId('asset');
        const enteredValue = Number(draft.value || 0);
        nextAssets = [
          {
            id: assetId,
            entityId: account.entityId,
            name:
              draft.name.trim() ||
              `${String(draft.metalType || 'metal')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (value) => value.toUpperCase())} Reserve`,
            category: 'metal',
            status: 'active',
            bookValue: enteredValue,
            marketValue: enteredValue,
            paymentMedium: 'specie',
            linkedLedgerAccountId: account.id,
            preciousMetalProfile: {
              metalType: draft.metalType,
              unitOfMeasure: draft.unitOfMeasure,
              quantity: Number(draft.quantity || 0) || undefined,
              storageLocation: draft.storageLocation.trim() || undefined,
              itemIdentifiers: draft.itemIdentifiers
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
              liquidationReadiness: 'review',
            },
            notes: 'Manual metal reserve holding added from the ledger reserve setup workspace.',
          },
          ...nextAssets,
        ];
        nextSelectedAssetIds.push(assetId);
      }

      if (draftHasInput && draft.type === 'wallet') {
        const walletId = buildId('wallet');
        nextWallets = [
          {
            id: walletId,
            entityId: account.entityId,
            name: draft.walletName.trim(),
            network: draft.network.trim(),
            address: draft.address.trim(),
            custodyType: draft.custodyType,
            connectionProvider: draft.provider,
            connectionStatus: draft.provider === 'manual' ? 'connected' : 'attention_needed',
            executionSupport: 'read_only',
            linkedLedgerAccountId: account.id,
            nativeAssetSymbol: draft.assetSymbol.trim() || undefined,
            notes: 'Wallet added from ledger reserve setup.',
          },
          ...nextWallets,
        ];
        nextSelectedWalletIds.push(walletId);

        if (draft.assetName.trim() || draft.assetSymbol.trim() || draft.assetQuantity.trim() || draft.assetValue.trim()) {
          const digitalAssetId = buildId('dasset');
          nextDigitalAssets = [
            {
              id: digitalAssetId,
              entityId: account.entityId,
              walletId,
              name: draft.assetName.trim() || draft.assetSymbol.trim() || draft.walletName.trim(),
              symbol: draft.assetSymbol.trim() || undefined,
              network: draft.network.trim(),
              assetSubtype: 'native_coin',
              quantity: Number(draft.assetQuantity || 0),
              estimatedValue: Number(draft.assetValue || 0),
              classification: 'payment',
              custodyStatus: 'controlled',
              complianceStatus: 'review',
              linkedLedgerAccountId: account.id,
            },
            ...nextDigitalAssets,
          ];
        }
      }

      const finalAssetIds = dedupe(nextSelectedAssetIds);
      const finalWalletIds = dedupe(nextSelectedWalletIds);

      nextAssets = nextAssets.map((item) => {
        if (item.entityId !== account.entityId) {
          return item;
        }
        if (finalAssetIds.includes(item.id)) {
          return { ...item, linkedLedgerAccountId: account.id };
        }
        if (item.linkedLedgerAccountId === account.id) {
          return { ...item, linkedLedgerAccountId: undefined };
        }
        return item;
      });

      nextWallets = nextWallets.map((item) => {
        if (item.entityId !== account.entityId) {
          return item;
        }
        if (finalWalletIds.includes(item.id)) {
          return { ...item, linkedLedgerAccountId: account.id };
        }
        if (item.linkedLedgerAccountId === account.id) {
          return { ...item, linkedLedgerAccountId: undefined };
        }
        return item;
      });

      nextDigitalAssets = nextDigitalAssets.map((item) => {
        if (item.entityId !== account.entityId) {
          return item;
        }
        if (item.walletId && finalWalletIds.includes(item.walletId)) {
          return { ...item, linkedLedgerAccountId: account.id };
        }
        if (item.linkedLedgerAccountId === account.id && (!item.walletId || !finalWalletIds.includes(item.walletId))) {
          return { ...item, linkedLedgerAccountId: undefined };
        }
        return item;
      });

      return {
        ...prev,
        ledgerAccounts: prev.ledgerAccounts.map((item) =>
          item.id === account.id
            ? {
                ...item,
                linkedAssetIds: finalAssetIds,
                linkedWalletIds: finalWalletIds,
              }
            : item,
        ),
        assets: nextAssets,
        wallets: nextWallets,
        digitalAssets: nextDigitalAssets,
        instruments: nextInstruments,
      };
    });

    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 8, 20, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 1300,
      }}
    >
      <div
        style={{
          width: 'min(1080px, 100%)',
          maxHeight: '88vh',
          overflow: 'auto',
          borderRadius: 22,
          border: '1px solid rgba(126,242,255,0.18)',
          background: 'linear-gradient(180deg, rgba(19,25,45,0.98), rgba(8,13,29,0.98))',
          boxShadow: '0 28px 90px rgba(0,0,0,0.42)',
          padding: 22,
          display: 'grid',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>Reserve Setup</div>
            <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
              {account.code} | {account.name} for {entityLabel}. Link reserve assets and wallets here, or add new UCC, note-held, metal, or crypto records directly into the ledger flow.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: '#e2e8f0',
              padding: '10px 12px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 1 }}>Linked Assets</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>{selectedAssetIds.length}</div>
          </div>
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 1 }}>Linked Wallets</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>{selectedWalletIds.length}</div>
          </div>
          <div style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 1 }}>Reserve Paper</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>{linkedInstruments.length}</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          <section
            style={{
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Link Existing Reserve Assets</div>
            <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
              Attach metals, reserve securities, receivables, or other supporting assets already in this entity.
            </div>
            <div style={{ display: 'grid', gap: 10, maxHeight: 280, overflow: 'auto' }}>
              {entityAssets.length ? (
                entityAssets.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px 1fr',
                      gap: 10,
                      alignItems: 'start',
                      padding: 10,
                      borderRadius: 12,
                      background: 'rgba(8, 13, 27, 0.54)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAssetIds.includes(item.id)}
                      onChange={() => toggleSelectedValue(item.id, selectedAssetIds, setSelectedAssetIds)}
                    />
                    <div>
                      <div style={{ color: '#f8fafc', fontWeight: 700 }}>{item.name}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>
                        {item.category} | book {account.currency || 'USD'} {item.bookValue.toLocaleString()}
                        {item.identifierCode ? ` | ${item.identifierCode}` : ''}
                      </div>
                    </div>
                  </label>
                ))
              ) : (
                <div style={{ color: '#94a3b8' }}>No entity assets are available yet.</div>
              )}
            </div>
          </section>

          <section
            style={{
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Link Existing Wallets</div>
            <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
              Attach self-custody or connected exchange wallets so the reserve account has live wallet continuity.
            </div>
            <div style={{ display: 'grid', gap: 10, maxHeight: 280, overflow: 'auto' }}>
              {entityWallets.length ? (
                entityWallets.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px 1fr',
                      gap: 10,
                      alignItems: 'start',
                      padding: 10,
                      borderRadius: 12,
                      background: 'rgba(8, 13, 27, 0.54)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedWalletIds.includes(item.id)}
                      onChange={() => toggleSelectedValue(item.id, selectedWalletIds, setSelectedWalletIds)}
                    />
                    <div>
                      <div style={{ color: '#f8fafc', fontWeight: 700 }}>{item.name}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>
                        {item.network} | {item.custodyType} | {item.address}
                      </div>
                    </div>
                  </label>
                ))
              ) : (
                <div style={{ color: '#94a3b8' }}>No wallets are available yet.</div>
              )}
            </div>
          </section>
        </div>

        <section
          style={{
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            padding: 16,
            display: 'grid',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Add New Reserve Record</div>
          <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
            Create reserve-side records from this ledger account without dropping into raw JSON.
          </div>

          <label style={labelStyle}>
            Reserve item type
            <select
              value={draft.type}
              onChange={(event) => setDraft((prev) => ({ ...buildEmptyDraft(), type: event.target.value as QuickAddType }))}
              style={inputStyle}
            >
              <option value="ucc">UCC / secured filing</option>
              <option value="note">Note held</option>
              <option value="metal">Metal reserve</option>
              <option value="wallet">Crypto wallet</option>
            </select>
          </label>

          {draft.type === 'ucc' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>
                Record name
                <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="AAC UCC reserve filing" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Filing number / reference
                <input value={draft.reference} onChange={(event) => updateDraft('reference', event.target.value)} placeholder="UCC file no." style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Debtor name
                <input value={draft.debtorName} onChange={(event) => updateDraft('debtorName', event.target.value)} placeholder="Debtor / grantor" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Secured party
                <input value={draft.securedParty} onChange={(event) => updateDraft('securedParty', event.target.value)} placeholder="Secured party / holder" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Jurisdiction
                <input value={draft.jurisdiction} onChange={(event) => updateDraft('jurisdiction', event.target.value)} placeholder="State / county / filing office" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Estimated value
                <input value={draft.value} onChange={(event) => updateDraft('value', event.target.value)} placeholder="0.00" style={inputStyle} />
              </label>
            </div>
          ) : null}

          {draft.type === 'note' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>
                Note title
                <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Promissory note - borrower name" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Note number / identifier
                <input value={draft.reference} onChange={(event) => updateDraft('reference', event.target.value)} placeholder="Instrument reference" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Issuer / borrower
                <input value={draft.issuerName} onChange={(event) => updateDraft('issuerName', event.target.value)} placeholder="Issuer or borrower name" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Face value
                <input value={draft.value} onChange={(event) => updateDraft('value', event.target.value)} placeholder="0.00" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Issue date
                <input type="date" value={draft.issueDate} onChange={(event) => updateDraft('issueDate', event.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Maturity date
                <input type="date" value={draft.maturityDate} onChange={(event) => updateDraft('maturityDate', event.target.value)} style={inputStyle} />
              </label>
            </div>
          ) : null}

          {draft.type === 'metal' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>
                Holding name
                <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Gold reserve lot" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Metal type
                <select value={draft.metalType} onChange={(event) => updateDraft('metalType', event.target.value as QuickAddDraft['metalType'])} style={inputStyle}>
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="platinum">Platinum</option>
                  <option value="palladium">Palladium</option>
                  <option value="mixed">Mixed</option>
                  <option value="jewelry">Jewelry</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={labelStyle}>
                Quantity
                <input value={draft.quantity} onChange={(event) => updateDraft('quantity', event.target.value)} placeholder="0" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Unit
                <select value={draft.unitOfMeasure} onChange={(event) => updateDraft('unitOfMeasure', event.target.value as QuickAddDraft['unitOfMeasure'])} style={inputStyle}>
                  <option value="oz">oz</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="piece">piece</option>
                  <option value="bag">bag</option>
                  <option value="lot">lot</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label style={labelStyle}>
                Estimated value
                <input value={draft.value} onChange={(event) => updateDraft('value', event.target.value)} placeholder="0.00" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Storage location
                <input value={draft.storageLocation} onChange={(event) => updateDraft('storageLocation', event.target.value)} placeholder="Vault / box / held with" style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Item identifiers
                <input value={draft.itemIdentifiers} onChange={(event) => updateDraft('itemIdentifiers', event.target.value)} placeholder="Serials, hallmark refs, comma separated" style={inputStyle} />
              </label>
            </div>
          ) : null}

          {draft.type === 'wallet' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={labelStyle}>
                Wallet name
                <input value={draft.walletName} onChange={(event) => updateDraft('walletName', event.target.value)} placeholder="Reserve treasury wallet" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Network
                <input value={draft.network} onChange={(event) => updateDraft('network', event.target.value)} placeholder="Ethereum, Bitcoin, Solana..." style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Wallet address
                <input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} placeholder="0x... or public address" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Custody
                <select value={draft.custodyType} onChange={(event) => updateDraft('custodyType', event.target.value as WalletRecord['custodyType'])} style={inputStyle}>
                  <option value="self_custody">Self custody</option>
                  <option value="exchange">Exchange</option>
                  <option value="qualified_custodian">Qualified custodian</option>
                  <option value="multisig">Multisig</option>
                  <option value="contract">Contract</option>
                </select>
              </label>
              <label style={labelStyle}>
                Provider
                <select value={draft.provider || 'manual'} onChange={(event) => updateDraft('provider', event.target.value as WalletRecord['connectionProvider'])} style={inputStyle}>
                  <option value="manual">Manual</option>
                  <option value="metamask">MetaMask</option>
                  <option value="coinbase">Coinbase Wallet</option>
                  <option value="walletconnect">WalletConnect</option>
                  <option value="coinbase_exchange">Coinbase Exchange</option>
                  <option value="kraken">Kraken</option>
                  <option value="binance_us">Binance US</option>
                  <option value="robinhood_crypto">Robinhood Crypto</option>
                </select>
              </label>
              <label style={labelStyle}>
                Native asset name
                <input value={draft.assetName} onChange={(event) => updateDraft('assetName', event.target.value)} placeholder="Bitcoin, Ether..." style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Symbol
                <input value={draft.assetSymbol} onChange={(event) => updateDraft('assetSymbol', event.target.value)} placeholder="BTC, ETH..." style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Quantity
                <input value={draft.assetQuantity} onChange={(event) => updateDraft('assetQuantity', event.target.value)} placeholder="0" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Estimated value
                <input value={draft.assetValue} onChange={(event) => updateDraft('assetValue', event.target.value)} placeholder="0.00" style={inputStyle} />
              </label>
            </div>
          ) : null}
        </section>

        {linkedInstruments.length ? (
          <section
            style={{
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              padding: 16,
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Reserve Paper Already Tied Here</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {linkedInstruments.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(8, 13, 27, 0.54)',
                    color: '#dbe4f0',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                    {item.instrumentType} | {item.legalIdentifier || 'No identifier'} | {item.denominationValue?.toLocaleString() || '0'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: '1px solid rgba(126,242,255,0.28)',
              background: 'linear-gradient(135deg, rgba(33,194,198,0.92), rgba(88,141,255,0.84))',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            Save Reserve Setup
          </button>
        </div>
      </div>
    </div>
  );
}
