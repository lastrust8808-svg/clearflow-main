import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Database, ShieldCheck, Plus, XCircle, Link as LinkIcon } from 'lucide-react';
import * as types from '../types';
import { useLedgerStore } from '../services/ledgerService';

interface Props {
  entity: types.Entity;
  onClose: () => void;
}

const assetClassOptions: types.DigitalAssetClass[] = [
  'Real Estate',
  'Precious Metal',
  'Coin',
  'Jewelry',
  'Equipment',
  'Receivable',
  'Promissory Note',
  'Security Instrument',
  'Trust Certificate',
  'Legal Instrument',
  'Intellectual Property',
  'Cash Equivalent',
  'Other',
];

const legalCharacterOptions: types.DigitalAssetLegalCharacter[] = [
  'Tangible Asset',
  'Intangible Asset',
  'Contract Right',
  'Payment Right',
  'Security Interest',
  'Beneficial Interest',
  'Utility Right',
  'Custodial Record',
  'Other',
];

const tokenClassOptions: types.AssetTokenClass[] = [
  'None',
  'RegistryToken',
  'ControlToken',
  'UtilityToken',
  'ClaimToken',
  'FractionalToken',
];

type LegacyLinkType =
  | ''
  | 'RealEstateAsset'
  | 'CreditInstrument'
  | 'TrustCertificate'
  | 'LegalInstrument'
  | 'ParcelRecord'
  | 'CollateralItem'
  | 'Other';

export const DigitalAssetRegistryWidget: React.FC<Props> = ({ entity, onClose }) => {
  const {
    digitalAssets,
    assetTokenProfiles,
    realEstateAssets,
    collateralItems,
    creditInstruments,
    trustCertificates,
    legalInstruments,
    parcelRecords,
    addDigitalAsset,
    setAssetTokenProfile,
  } = useLedgerStore();

  const entityAssets = useMemo(
    () => digitalAssets.filter((a) => a.entityId === entity.id),
    [digitalAssets, entity.id]
  );

  const entityRealEstateAssets = useMemo(
    () => realEstateAssets.filter((a) => a.entityId === entity.id),
    [realEstateAssets, entity.id]
  );

  const entityCollateralItems = useMemo(
    () => collateralItems.filter((a) => {
      const linkedDigital = digitalAssets.find((d) => d.id === a.assetReferenceId);
      return linkedDigital?.entityId === entity.id || !a.assetReferenceId;
    }),
    [collateralItems, digitalAssets, entity.id]
  );

  const entityCreditInstruments = useMemo(
    () => creditInstruments.filter((a) => a.entityId === entity.id),
    [creditInstruments, entity.id]
  );

  const entityTrustCertificates = useMemo(
    () => trustCertificates.filter((a) => a.entityId === entity.id),
    [trustCertificates, entity.id]
  );

  const entityLegalInstruments = useMemo(
    () => legalInstruments.filter((a) => a.entityId === entity.id),
    [legalInstruments, entity.id]
  );

  const entityParcelRecords = useMemo(
    () => parcelRecords.filter((a) => a.entityId === entity.id),
    [parcelRecords, entity.id]
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assetClass, setAssetClass] = useState<types.DigitalAssetClass>('Other');
  const [legalCharacter, setLegalCharacter] = useState<types.DigitalAssetLegalCharacter>('Tangible Asset');
  const [jurisdiction, setJurisdiction] = useState('');
  const [bookValue, setBookValue] = useState('');
  const [fairValue, setFairValue] = useState('');
  const [reserveValue, setReserveValue] = useState('');
  const [legacyLinkType, setLegacyLinkType] = useState<LegacyLinkType>('');
  const [legacyLinkId, setLegacyLinkId] = useState('');
  const [tokenClass, setTokenClass] = useState<types.AssetTokenClass>('RegistryToken');
  const [tokenize, setTokenize] = useState(true);
  const [transferRestricted, setTransferRestricted] = useState(true);
  const [requiresTrusteeApproval, setRequiresTrusteeApproval] = useState(true);
  const [isFractionalized, setIsFractionalized] = useState(false);
  const [isUtilityOnly, setIsUtilityOnly] = useState(false);
  const [confersProfitShare, setConfersProfitShare] = useState(false);
  const [confersCreditorRights, setConfersCreditorRights] = useState(false);
  const [confersReturnOfPrincipal, setConfersReturnOfPrincipal] = useState(false);

  const nextAssetNumber = `DAR-${String(entityAssets.length + 1).padStart(4, '0')}`;

  const legacyOptions = useMemo(() => {
    switch (legacyLinkType) {
      case 'RealEstateAsset':
        return entityRealEstateAssets.map((item) => ({
          id: item.id,
          label: `${item.propertyAddress} (${item.status})`,
        }));
      case 'CreditInstrument':
        return entityCreditInstruments.map((item) => ({
          id: item.id,
          label: `${item.type} • ${item.faceAmount} • ${item.status}`,
        }));
      case 'TrustCertificate':
        return entityTrustCertificates.map((item) => ({
          id: item.id,
          label: `${item.certificateNumber} • ${item.status}`,
        }));
      case 'LegalInstrument':
        return entityLegalInstruments.map((item) => ({
          id: item.id,
          label: `${item.title || item.instrumentType || item.id}`,
        }));
      case 'ParcelRecord':
        return entityParcelRecords.map((item) => ({
          id: item.id,
          label: `${item.parcelId || item.id}`,
        }));
      case 'CollateralItem':
        return entityCollateralItems.map((item) => ({
          id: item.id,
          label: `${item.description} • ${item.status}`,
        }));
      default:
        return [];
    }
  }, [
    legacyLinkType,
    entityRealEstateAssets,
    entityCreditInstruments,
    entityTrustCertificates,
    entityLegalInstruments,
    entityParcelRecords,
    entityCollateralItems,
  ]);

  const handleCreate = () => {
    if (!title.trim()) return;

    const assetId = uuidv4();
    const now = new Date().toISOString();

    const newAsset: types.DigitalAssetRecord = {
      id: assetId,
      entityId: entity.id,
      assetNumber: nextAssetNumber,
      title: title.trim(),
      description: description.trim() || undefined,
      assetClass,
      legalCharacter,
      status: 'Registered',
      jurisdiction: jurisdiction.trim() || undefined,
      custodyStatus: 'Self Custody',
      controlStatus: 'Trustee Controlled',
      valuationBasis: 'User Entered',
      bookValue: bookValue ? Number(bookValue) : undefined,
      fairValue: fairValue ? Number(fairValue) : undefined,
      reserveValue: reserveValue ? Number(reserveValue) : undefined,
      linkedLegacyRecordType: legacyLinkType || undefined,
      linkedLegacyRecordId: legacyLinkId || undefined,
      sourceDocumentIds: [],
      documentHashChain: [],
      complianceFlags: [],
      tags: [],
      effectiveDate: now,
      lastReviewedAt: now,
      _version: '1.0',
    };

    addDigitalAsset(newAsset);

    if (tokenize) {
      setAssetTokenProfile({
        id: uuidv4(),
        assetId,
        entityId: entity.id,
        tokenClass,
        representationType: 'Off-Chain Registry',
        transferRestricted,
        requiresTrusteeApproval,
        confersProfitShare,
        confersCreditorRights,
        confersReturnOfPrincipal,
        isUtilityOnly,
        isFractionalized,
        notes: '',
        _version: '1.0',
      });
    }

    setTitle('');
    setDescription('');
    setAssetClass('Other');
    setLegalCharacter('Tangible Asset');
    setJurisdiction('');
    setBookValue('');
    setFairValue('');
    setReserveValue('');
    setLegacyLinkType('');
    setLegacyLinkId('');
    setTokenClass('RegistryToken');
    setTokenize(true);
    setTransferRestricted(true);
    setRequiresTrusteeApproval(true);
    setIsFractionalized(false);
    setIsUtilityOnly(false);
    setConfersProfitShare(false);
    setConfersCreditorRights(false);
    setConfersReturnOfPrincipal(false);
  };

  const getTokenProfile = (assetId: string) => assetTokenProfiles.find((p) => p.assetId === assetId);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-800 font-bold text-xl">
            <Database className="text-indigo-600" size={22} />
            Digital Asset Registry
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Register assets, classify legal character, and attach a non-breaking tokenization profile.
          </p>
        </div>
        <button onClick={onClose} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm">
          <XCircle size={16} />
          Close
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Register New Asset</h2>
            <p className="text-xs text-slate-500">Asset Number Preview: {nextAssetNumber}</p>
          </div>

          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Asset title" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[90px]" placeholder="Description" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as types.DigitalAssetClass)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {assetClassOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={legalCharacter} onChange={(e) => setLegalCharacter(e.target.value as types.DigitalAssetLegalCharacter)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {legalCharacterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>

          <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Jurisdiction" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={bookValue} onChange={(e) => setBookValue(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Book Value" />
            <input value={fairValue} onChange={(e) => setFairValue(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Fair Value" />
            <input value={reserveValue} onChange={(e) => setReserveValue(e.target.value)} type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Reserve Value" />
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <LinkIcon size={16} className="text-sky-700" />
              <h3 className="text-sm font-bold text-sky-900">Link to Existing Record</h3>
            </div>

            <select
              value={legacyLinkType}
              onChange={(e) => {
                setLegacyLinkType(e.target.value as LegacyLinkType);
                setLegacyLinkId('');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No linked legacy record</option>
              <option value="RealEstateAsset">Real Estate Asset</option>
              <option value="CreditInstrument">Credit Instrument</option>
              <option value="TrustCertificate">Trust Certificate</option>
              <option value="LegalInstrument">Legal Instrument</option>
              <option value="ParcelRecord">Parcel Record</option>
              <option value="CollateralItem">Collateral Item</option>
              <option value="Other">Other</option>
            </select>

            {legacyLinkType !== '' && legacyLinkType !== 'Other' && (
              <select
                value={legacyLinkId}
                onChange={(e) => setLegacyLinkId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select linked record</option>
                {legacyOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            )}

            {legacyLinkType === 'Other' && (
              <input
                value={legacyLinkId}
                onChange={(e) => setLegacyLinkId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Manual linked record ID"
              />
            )}
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-indigo-700" />
              <h3 className="text-sm font-bold text-indigo-900">Tokenization Profile</h3>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={tokenize} onChange={(e) => setTokenize(e.target.checked)} />
              Create tokenization profile
            </label>

            {tokenize && (
              <>
                <select value={tokenClass} onChange={(e) => setTokenClass(e.target.value as types.AssetTokenClass)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {tokenClassOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={transferRestricted} onChange={(e) => setTransferRestricted(e.target.checked)} /> Transfer Restricted</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={requiresTrusteeApproval} onChange={(e) => setRequiresTrusteeApproval(e.target.checked)} /> Trustee Approval</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={isFractionalized} onChange={(e) => setIsFractionalized(e.target.checked)} /> Fractionalized</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={isUtilityOnly} onChange={(e) => setIsUtilityOnly(e.target.checked)} /> Utility Only</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={confersProfitShare} onChange={(e) => setConfersProfitShare(e.target.checked)} /> Profit Share</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={confersCreditorRights} onChange={(e) => setConfersCreditorRights(e.target.checked)} /> Creditor Rights</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={confersReturnOfPrincipal} onChange={(e) => setConfersReturnOfPrincipal(e.target.checked)} /> Return of Principal</label>
                </div>
              </>
            )}
          </div>

          <button onClick={handleCreate} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-3">
            <Plus size={16} />
            Register Asset
          </button>
        </div>

        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Registry Records</h2>
          <p className="text-xs text-slate-500 mb-4">{entityAssets.length} asset records for this entity</p>

          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            {entityAssets.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No digital asset registry entries yet.
              </div>
            )}

            {entityAssets.map((asset) => {
              const tokenProfile = getTokenProfile(asset.id);
              return (
                <div key={asset.id} className="rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{asset.title}</span>
                        <span className="text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded border">{asset.assetNumber}</span>
                        <span className="text-[10px] uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-200">{asset.assetClass}</span>
                        <span className="text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200">{asset.legalCharacter}</span>
                      </div>
                      {asset.description && <p className="text-sm text-slate-600 mt-2">{asset.description}</p>}
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      <div>Status: <span className="font-semibold text-slate-700">{asset.status}</span></div>
                      <div>Control: <span className="font-semibold text-slate-700">{asset.controlStatus}</span></div>
                      <div>Custody: <span className="font-semibold text-slate-700">{asset.custodyStatus}</span></div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <div className="uppercase tracking-wide text-slate-500 font-bold mb-1">Values</div>
                      <div>Book: {asset.bookValue ?? '—'}</div>
                      <div>Fair: {asset.fairValue ?? '—'}</div>
                      <div>Reserve: {asset.reserveValue ?? '—'}</div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <div className="uppercase tracking-wide text-slate-500 font-bold mb-1">Registry</div>
                      <div>Jurisdiction: {asset.jurisdiction || '—'}</div>
                      <div>Documents: {asset.sourceDocumentIds.length}</div>
                      <div>Hashes: {asset.documentHashChain.length}</div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <div className="uppercase tracking-wide text-slate-500 font-bold mb-1">Legacy Link</div>
                      <div>Type: {asset.linkedLegacyRecordType || '—'}</div>
                      <div>ID: {asset.linkedLegacyRecordId || '—'}</div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <div className="uppercase tracking-wide text-slate-500 font-bold mb-1">Token Profile</div>
                      {tokenProfile ? (
                        <>
                          <div>Class: {tokenProfile.tokenClass}</div>
                          <div>Restricted: {tokenProfile.transferRestricted ? 'Yes' : 'No'}</div>
                          <div>Trustee Approval: {tokenProfile.requiresTrusteeApproval ? 'Yes' : 'No'}</div>
                        </>
                      ) : (
                        <div>No token profile</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
