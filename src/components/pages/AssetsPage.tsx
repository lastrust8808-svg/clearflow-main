import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AssetRecord, CoreDataBundle, InstrumentRecord } from '../../types/core';
import { buildCapitalStrategySummary } from '../../services/capitalStrategy.service';
import { buildAssetAcquisitionRailViews } from '../../services/assetAcquisitionRails.service';
import { buildCollateralConversionRailViews } from '../../services/collateralConversionRails.service';
import { getConversionConnectorCatalog } from '../../services/conversionConnectorCatalog.service';
import { buildRealEstateSecuritizationSummary } from '../../services/realEstateSecuritization.service';
import { buildRealPropertyAcquisitionRailViews } from '../../services/realPropertyAcquisitionRails.service';
import { saveDocumentFile } from '../../services/documentVault.service';
import {
  getSecurityMerchantCatalog,
  getSecurityMerchantSource,
} from '../../services/securityMerchantCatalog.service';
import { buildTrustFundingViews } from '../../services/trustFunding.service';
import { buildTreasuryPresentmentMailTodos } from '../../services/treasuryPresentmentMail.service';
import WalletConnectionWorkspace from '../assets/WalletConnectionWorkspace';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface AssetsPageProps {
  data: CoreDataBundle;
  setData: Dispatch<SetStateAction<CoreDataBundle>>;
}

function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function statusPillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 9px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(45,212,191,0.45)' : 'rgba(248,113,113,0.32)'}`,
    background: active ? 'rgba(15,118,110,0.22)' : 'rgba(127,29,29,0.16)',
    color: active ? '#99f6e4' : '#fecaca',
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  };
}

type DepositorySource = NonNullable<
  NonNullable<AssetRecord['bookEntryReserveProfile']>['depositorySource']
>;

interface BookEntrySecurityDraft {
  entityId: string;
  registrarOffice: string;
  county: string;
  state: string;
  recorderBook: string;
  recorderPage: string;
  recordingStickerReference: string;
  recordingNumber: string;
  recordedAt: string;
  recordingDocumentType: string;
  recorderName: string;
  feeBreakdownText: string;
  bookEntryIdentifier: string;
  securityPoolName: string;
  issuerName: string;
  identifierCode: string;
  isinCode: string;
  marketSector: NonNullable<AssetRecord['marketSector']> | '';
  taxTreatment: NonNullable<AssetRecord['taxTreatment']> | '';
  liquidityProfile: NonNullable<AssetRecord['liquidityProfile']> | '';
  couponRate: string;
  maturityDate: string;
  parValue: string;
  marketValue: string;
  units: string;
  depositorySource: DepositorySource;
  depositoryReference: string;
  notes: string;
  createInstrument: boolean;
  selectedCandidateId: string;
  uploadedFile: File | null;
}

interface BookEntrySecurityCandidate {
  id: string;
  kind: 'asset' | 'instrument' | 'new';
  assetId?: string;
  instrumentId?: string;
  label: string;
  subtitle: string;
  matchReason: string;
  score: number;
}

function buildInitialBookEntrySecurityDraft(defaultEntityId?: string): BookEntrySecurityDraft {
  return {
    entityId: defaultEntityId || '',
    registrarOffice: '',
    county: '',
    state: '',
    recorderBook: '',
    recorderPage: '',
    recordingStickerReference: '',
    recordingNumber: '',
    recordedAt: '',
    recordingDocumentType: '',
    recorderName: '',
    feeBreakdownText: '',
    bookEntryIdentifier: '',
    securityPoolName: '',
    issuerName: '',
    identifierCode: '',
    isinCode: '',
    marketSector: 'municipal',
    taxTreatment: '',
    liquidityProfile: '',
    couponRate: '',
    maturityDate: '',
    parValue: '',
    marketValue: '',
    units: '',
    depositorySource: 'dtcc',
    depositoryReference: '',
    notes: '',
    createInstrument: true,
    selectedCandidateId: 'new',
    uploadedFile: null,
  };
}

function normalizeBookEntryText(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => (part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function buildBookEntrySecurityCandidates(
  data: CoreDataBundle,
  draft: BookEntrySecurityDraft,
): BookEntrySecurityCandidate[] {
  const identifier = draft.identifierCode.trim().toLowerCase();
  const bookEntryIdentifier = draft.bookEntryIdentifier.trim().toLowerCase();
  const issuer = draft.issuerName.trim().toLowerCase();
  const pool = draft.securityPoolName.trim().toLowerCase();

  const evaluateScore = (input: {
    identifierCode?: string;
    issuerName?: string;
    titleOrName?: string;
    bookEntryIdentifier?: string;
    poolName?: string;
  }) => {
    let score = 0;
    const reasons: string[] = [];
    if (identifier && input.identifierCode?.trim().toLowerCase() === identifier) {
      score += 120;
      reasons.push('exact identifier');
    }
    if (
      bookEntryIdentifier &&
      input.bookEntryIdentifier?.trim().toLowerCase() === bookEntryIdentifier
    ) {
      score += 110;
      reasons.push('exact book-entry id');
    }
    if (pool && normalizeBookEntryText(input.poolName, input.titleOrName).includes(pool)) {
      score += 55;
      reasons.push('pool name');
    }
    if (issuer && normalizeBookEntryText(input.issuerName).includes(issuer)) {
      score += 35;
      reasons.push('issuer');
    }
    return {
      score,
      reason: reasons.join(' + '),
    };
  };

  const assetCandidates = data.assets
    .map((asset) => {
      const match = evaluateScore({
        identifierCode: asset.identifierCode,
        issuerName: asset.issuerName,
        titleOrName: asset.name,
        bookEntryIdentifier: asset.bookEntryReserveProfile?.bookEntryIdentifier,
        poolName: asset.bookEntryReserveProfile?.securityPoolName,
      });
      if (match.score === 0) {
        return null;
      }
      return {
        id: `asset:${asset.id}`,
        kind: 'asset' as const,
        assetId: asset.id,
        label: asset.name,
        subtitle: `${asset.marketSector || asset.category} | ${asset.identifierCode || 'no identifier'}`,
        matchReason: match.reason || 'reserve asset match',
        score: match.score,
      };
    })
    .filter((item): item is BookEntrySecurityCandidate => Boolean(item));

  const instrumentCandidates = data.instruments
    .map((instrument) => {
      const match = evaluateScore({
        identifierCode: instrument.identifierCode,
        issuerName: instrument.issuerName,
        titleOrName: instrument.title,
        bookEntryIdentifier: instrument.bookEntryReserveProfile?.bookEntryIdentifier,
        poolName: instrument.bookEntryReserveProfile?.securityPoolName,
      });
      if (match.score === 0) {
        return null;
      }
      return {
        id: `instrument:${instrument.id}`,
        kind: 'instrument' as const,
        instrumentId: instrument.id,
        label: instrument.title,
        subtitle: `${instrument.marketSector || instrument.sourceClass || instrument.instrumentType} | ${instrument.identifierCode || 'no identifier'}`,
        matchReason: match.reason || 'instrument match',
        score: match.score,
      };
    })
    .filter((item): item is BookEntrySecurityCandidate => Boolean(item));

  const manualCandidate: BookEntrySecurityCandidate = {
    id: 'new',
    kind: 'new',
    label:
      draft.securityPoolName.trim() ||
      draft.issuerName.trim() ||
      draft.identifierCode.trim() ||
      'Create new reserve security',
    subtitle: `${draft.depositorySource.toUpperCase()} | create fresh reserve holding`,
    matchReason: 'new reserve asset',
    score: 1,
  };

  return [...assetCandidates, ...instrumentCandidates]
    .sort((left, right) => right.score - left.score)
    .concat(manualCandidate);
}

export default function AssetsPage({ data, setData }: AssetsPageProps) {
  const [isBookEntryModalOpen, setIsBookEntryModalOpen] = useState(false);
  const [bookEntryNotice, setBookEntryNotice] = useState('');
  const [isBookEntrySubmitting, setIsBookEntrySubmitting] = useState(false);
  const [bookEntryDraft, setBookEntryDraft] = useState<BookEntrySecurityDraft>(() =>
    buildInitialBookEntrySecurityDraft(''),
  );
  const marketableAssets = data.assets.filter(
    (asset) =>
      asset.marketSector === 'municipal' ||
      asset.category === 'security' ||
      Boolean(asset.identifierCode),
  );

  const marketableInstruments = data.instruments.filter(
    (instrument) =>
      instrument.marketSector === 'municipal' ||
      instrument.sourceClass === 'bond' ||
      Boolean(instrument.identifierCode),
  );

  const municipalCount =
    marketableAssets.filter((asset) => asset.marketSector === 'municipal').length +
    marketableInstruments.filter((instrument) => instrument.marketSector === 'municipal').length;
  const municipalDisclosureReviews = data.municipalDisclosures.filter(
    (item) => item.status === 'review' || item.status === 'missing' || item.status === 'stale',
  );
  const municipalEventWatchCount = data.municipalEventNotices.filter(
    (item) => item.severity === 'watch' || item.severity === 'critical' || item.status === 'open',
  ).length;
  const capitalSummary = buildCapitalStrategySummary({
    borrowingFacilities: data.borrowingFacilities,
    collateralHoldings: data.collateralHoldings,
    futuresStrategies: data.futuresStrategies,
    liquidationPlans: data.liquidationPlans,
  });
  const realEstateSecuritySummary = buildRealEstateSecuritizationSummary(data);
  const assetAcquisitionViews = buildAssetAcquisitionRailViews(data);
  const collateralConversionViews = buildCollateralConversionRailViews(data);
  const conversionConnectors = getConversionConnectorCatalog();
  const securityMerchantCatalog = getSecurityMerchantCatalog();
  const realPropertyAcquisitionViews = buildRealPropertyAcquisitionRailViews(data);
  const trustFundingViews = buildTrustFundingViews(data);
  const treasuryPresentmentMailTodos = buildTreasuryPresentmentMailTodos(data);
  const preciousMetalAssets = data.assets.filter(
    (asset) => asset.category === 'metal' || Boolean(asset.preciousMetalProfile),
  );
  const dtccConnector = conversionConnectors.find((item) => item.key === 'dtcc-api-marketplace');
  const bookEntryCandidates = useMemo(
    () => buildBookEntrySecurityCandidates(data, bookEntryDraft),
    [data, bookEntryDraft],
  );

  useEffect(() => {
    if (!isBookEntryModalOpen) {
      return;
    }
    if (!bookEntryDraft.entityId && data.entities[0]?.id) {
      setBookEntryDraft((prev) => ({ ...prev, entityId: data.entities[0]?.id || '' }));
    }
  }, [bookEntryDraft.entityId, data.entities, isBookEntryModalOpen]);

  useEffect(() => {
    if (!isBookEntryModalOpen) {
      return;
    }
    if (!bookEntryCandidates.some((candidate) => candidate.id === bookEntryDraft.selectedCandidateId)) {
      setBookEntryDraft((prev) => ({
        ...prev,
        selectedCandidateId: bookEntryCandidates[0]?.id || 'new',
      }));
    }
  }, [bookEntryCandidates, bookEntryDraft.selectedCandidateId, isBookEntryModalOpen]);

  const openBookEntryModal = () => {
    setBookEntryNotice('');
    setBookEntryDraft(buildInitialBookEntrySecurityDraft(data.entities[0]?.id));
    setIsBookEntryModalOpen(true);
  };

  const handleBookEntrySubmit = async () => {
    if (!bookEntryDraft.entityId || isBookEntrySubmitting) {
      return;
    }

    const hasMinimumIdentity = Boolean(
      bookEntryDraft.identifierCode.trim() ||
        bookEntryDraft.bookEntryIdentifier.trim() ||
        bookEntryDraft.securityPoolName.trim() ||
        bookEntryDraft.issuerName.trim(),
    );
    if (!hasMinimumIdentity) {
      setBookEntryNotice(
        'Add at least one identifier, pool name, issuer, or book-entry reference before saving this security intake.',
      );
      return;
    }

    const targetEntity = data.entities.find((entity) => entity.id === bookEntryDraft.entityId);
    if (!targetEntity) {
      setBookEntryNotice('Choose the entity that should own this reserve security before saving.');
      return;
    }

    setIsBookEntrySubmitting(true);
    const stamp = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const selectedCandidate =
      bookEntryCandidates.find((candidate) => candidate.id === bookEntryDraft.selectedCandidateId) ||
      bookEntryCandidates[0];
    const matchedInstrument =
      selectedCandidate?.kind === 'instrument'
        ? data.instruments.find((item) => item.id === selectedCandidate.instrumentId)
        : null;
    const matchedAsset =
      selectedCandidate?.kind === 'asset'
        ? data.assets.find((item) => item.id === selectedCandidate.assetId)
        : matchedInstrument?.linkedAssetIds?.length
          ? data.assets.find((item) => item.id === matchedInstrument.linkedAssetIds?.[0])
          : null;
    const nextAssetId = matchedAsset?.id || `asset-book-entry-${stamp}`;
    const nextInstrumentId =
      selectedCandidate?.kind === 'instrument'
        ? selectedCandidate.instrumentId
        : bookEntryDraft.createInstrument
          ? `inst-book-entry-${stamp}`
          : null;

    try {
      const uploadedFileMetadata = bookEntryDraft.uploadedFile
        ? await saveDocumentFile(`book-entry-security-${stamp}`, bookEntryDraft.uploadedFile)
        : null;
      const documentId = `doc-book-entry-${stamp}`;
      const securityName =
        bookEntryDraft.securityPoolName.trim() ||
        matchedAsset?.name ||
        matchedInstrument?.title ||
        bookEntryDraft.issuerName.trim() ||
        bookEntryDraft.identifierCode.trim() ||
        'Reserve security';
      const depositorySourceLabel =
        getSecurityMerchantSource(bookEntryDraft.depositorySource)?.label ||
        bookEntryDraft.depositorySource;
      const numericParValue = Number(bookEntryDraft.parValue || 0);
      const numericMarketValue = Number(bookEntryDraft.marketValue || 0);
      const numericCouponRate = Number(bookEntryDraft.couponRate || 0);
      const nextDocument = {
        id: documentId,
        entityId: targetEntity.id,
        title: `${securityName} Book-Entry Support`,
        category: 'financial' as const,
        date: today,
        status: 'final' as const,
        outputStatus: 'ready' as const,
        summary:
          'County registrar and book-entry reserve intake retained for identifier matching, depository reference, and reserve posting.',
        fileName: uploadedFileMetadata?.fileName,
        mimeType: uploadedFileMetadata?.mimeType,
        sizeBytes: uploadedFileMetadata?.sizeBytes,
        uploadedAt: uploadedFileMetadata?.uploadedAt,
        sourceFileId: uploadedFileMetadata?.sourceFileId,
        sourceRecordType: 'document' as const,
        sourceRecordId: nextAssetId,
        linkedAssetIds: [nextAssetId],
        linkedInstrumentIds: nextInstrumentId ? [nextInstrumentId] : undefined,
        generatedBody: `# Book-Entry Security Intake\n\nEntity: ${targetEntity.displayName || targetEntity.name}\nSecurity / Pool: ${securityName}\nRegistrar Office: ${bookEntryDraft.registrarOffice || 'Not provided'}\nCounty / State: ${bookEntryDraft.county || 'Not provided'}${bookEntryDraft.state ? `, ${bookEntryDraft.state}` : ''}\nRecorder Book / Page: ${bookEntryDraft.recorderBook || 'n/a'} / ${bookEntryDraft.recorderPage || 'n/a'}\nSticker Ref / BK-PG: ${bookEntryDraft.recordingStickerReference || 'Not provided'}\nRecording Number: ${bookEntryDraft.recordingNumber || 'Not provided'}\nRecorded At: ${bookEntryDraft.recordedAt || 'Not provided'}\nRecorded Document Type: ${bookEntryDraft.recordingDocumentType || 'Not provided'}\nRecorder Name: ${bookEntryDraft.recorderName || 'Not provided'}\nSticker Fee Breakdown: ${bookEntryDraft.feeBreakdownText || 'Not provided'}\nBook-Entry Identifier: ${bookEntryDraft.bookEntryIdentifier || 'Not provided'}\nIdentifier Code: ${bookEntryDraft.identifierCode || 'Not provided'}\nISIN: ${bookEntryDraft.isinCode || 'Not provided'}\nSearch / Depository Source: ${depositorySourceLabel}\nDepository Reference: ${bookEntryDraft.depositoryReference || 'Not provided'}\nIssuer: ${bookEntryDraft.issuerName || 'Not provided'}\nCoupon: ${numericCouponRate || 0}\nMaturity: ${bookEntryDraft.maturityDate || 'Not provided'}\nPar Value: ${numericParValue || 0}\nMarket Value: ${numericMarketValue || 0}\nMatched Candidate: ${selectedCandidate?.label || 'New reserve security'}\n\nNotes\n${bookEntryDraft.notes || 'No additional notes entered.'}`,
        storageOwner: 'user_owned' as const,
        retentionClass: 'financial_evidence' as const,
        externalStorageTarget: 'google_drive' as const,
        externalStorageStatus: 'ready' as const,
        storageNotes:
          'Retained for reserve security support, depository lookup evidence, and book-entry source tracing.',
      };

      setData((prev) => {
        const nextDocuments = [nextDocument, ...(prev.documents ?? [])];
        const nextAssets = [...prev.assets];
        const nextInstruments = [...prev.instruments];
        const linkedDocumentIds = Array.from(
          new Set([documentId, ...(matchedAsset?.linkedDocumentIds ?? []), ...(matchedInstrument?.linkedDocumentIds ?? [])]),
        );
        const nextBookEntryProfile = {
          registrarOffice: bookEntryDraft.registrarOffice.trim() || undefined,
          county: bookEntryDraft.county.trim() || undefined,
          state: bookEntryDraft.state.trim() || undefined,
          recorderBook: bookEntryDraft.recorderBook.trim() || undefined,
          recorderPage: bookEntryDraft.recorderPage.trim() || undefined,
          recordingStickerReference:
            bookEntryDraft.recordingStickerReference.trim() || undefined,
          recordingNumber: bookEntryDraft.recordingNumber.trim() || undefined,
          recordedAt: bookEntryDraft.recordedAt || undefined,
          recordingDocumentType:
            bookEntryDraft.recordingDocumentType.trim() || undefined,
          recorderName: bookEntryDraft.recorderName.trim() || undefined,
          feeBreakdownText: bookEntryDraft.feeBreakdownText.trim() || undefined,
          bookEntryIdentifier: bookEntryDraft.bookEntryIdentifier.trim() || undefined,
          securityPoolName: bookEntryDraft.securityPoolName.trim() || securityName,
          depositorySource: bookEntryDraft.depositorySource,
          depositoryReference: bookEntryDraft.depositoryReference.trim() || undefined,
          isinCode: bookEntryDraft.isinCode.trim() || undefined,
          reserveApplicationStatus: 'reserve_added' as const,
          sourceDocumentId: documentId,
          lastMatchedAt: new Date().toISOString(),
        };

        const nextAsset: AssetRecord = {
          ...(matchedAsset || {
            id: nextAssetId,
            entityId: targetEntity.id,
            name: securityName,
            category: 'security',
            status: 'active',
            bookValue: numericParValue || numericMarketValue || 0,
          }),
          entityId: targetEntity.id,
          name: securityName,
          category: 'security',
          status: matchedAsset?.status || 'active',
          bookValue:
            numericParValue ||
            numericMarketValue ||
            matchedAsset?.bookValue ||
            matchedInstrument?.denominationValue ||
            0,
          marketValue: numericMarketValue || matchedAsset?.marketValue,
          paymentMedium: matchedAsset?.paymentMedium || 'fiat',
          marketSector:
            bookEntryDraft.marketSector || matchedAsset?.marketSector || matchedInstrument?.marketSector,
          identifierCode:
            bookEntryDraft.identifierCode.trim() ||
            matchedAsset?.identifierCode ||
            matchedInstrument?.identifierCode,
          issuerName:
            bookEntryDraft.issuerName.trim() ||
            matchedAsset?.issuerName ||
            matchedInstrument?.issuerName,
          couponRate:
            numericCouponRate || matchedAsset?.couponRate || matchedInstrument?.couponRate,
          maturityDate:
            bookEntryDraft.maturityDate || matchedAsset?.maturityDate || matchedInstrument?.maturityDate,
          taxTreatment:
            bookEntryDraft.taxTreatment || matchedAsset?.taxTreatment || matchedInstrument?.taxTreatment,
          liquidityProfile:
            bookEntryDraft.liquidityProfile ||
            matchedAsset?.liquidityProfile ||
            matchedInstrument?.liquidityProfile ||
            'dealer_market',
          linkedDocumentIds,
          bookEntryReserveProfile: {
            ...matchedAsset?.bookEntryReserveProfile,
            ...nextBookEntryProfile,
          },
          notes: [matchedAsset?.notes, bookEntryDraft.notes.trim()]
            .filter(Boolean)
            .join('\n\n'),
        };

        const existingAssetIndex = nextAssets.findIndex((item) => item.id === nextAsset.id);
        if (existingAssetIndex >= 0) {
          nextAssets[existingAssetIndex] = nextAsset;
        } else {
          nextAssets.unshift(nextAsset);
        }

        if (nextInstrumentId) {
          const nextInstrument: InstrumentRecord = {
            ...(matchedInstrument || {
              id: nextInstrumentId,
              entityId: targetEntity.id,
              title: securityName,
              instrumentType: 'custody_record',
            }),
            entityId: targetEntity.id,
            title: securityName,
            instrumentType: matchedInstrument?.instrumentType || 'custody_record',
            sourceClass: matchedInstrument?.sourceClass || 'bond',
            marketSector:
              bookEntryDraft.marketSector || matchedInstrument?.marketSector || 'municipal',
            identifierCode:
              bookEntryDraft.identifierCode.trim() || matchedInstrument?.identifierCode,
            issuerName: bookEntryDraft.issuerName.trim() || matchedInstrument?.issuerName,
            issueDate: matchedInstrument?.issueDate || today,
            maturityDate: bookEntryDraft.maturityDate || matchedInstrument?.maturityDate,
            denominationValue:
              numericParValue || matchedInstrument?.denominationValue || nextAsset.bookValue,
            couponRate: numericCouponRate || matchedInstrument?.couponRate,
            taxTreatment:
              bookEntryDraft.taxTreatment || matchedInstrument?.taxTreatment,
            liquidityProfile:
              bookEntryDraft.liquidityProfile ||
              matchedInstrument?.liquidityProfile ||
              'dealer_market',
            linkedAssetIds: Array.from(
              new Set([nextAsset.id, ...(matchedInstrument?.linkedAssetIds ?? [])]),
            ),
            linkedDocumentIds: Array.from(
              new Set([documentId, ...(matchedInstrument?.linkedDocumentIds ?? [])]),
            ),
            issuanceStatus: matchedInstrument?.issuanceStatus || 'allocated',
            bookEntryReserveProfile: {
              ...matchedInstrument?.bookEntryReserveProfile,
              ...nextBookEntryProfile,
            },
            notes: [matchedInstrument?.notes, bookEntryDraft.notes.trim()]
              .filter(Boolean)
              .join('\n\n'),
          };

          const existingInstrumentIndex = nextInstruments.findIndex(
            (item) => item.id === nextInstrument.id,
          );
          if (existingInstrumentIndex >= 0) {
            nextInstruments[existingInstrumentIndex] = nextInstrument;
          } else {
            nextInstruments.unshift(nextInstrument);
          }
        }

        return {
          ...prev,
          assets: nextAssets,
          instruments: nextInstruments,
          documents: nextDocuments,
        };
      });

      setBookEntryNotice(
        `Saved ${securityName} into asset reserve${selectedCandidate?.kind === 'asset' ? ' by updating the matched reserve asset' : selectedCandidate?.kind === 'instrument' ? ' by linking the matched instrument to reserve' : ' as a new reserve security'}.`,
      );
      setIsBookEntryModalOpen(false);
    } catch (error) {
      setBookEntryNotice(
        error instanceof Error ? error.message : 'The book-entry reserve security could not be saved.',
      );
    } finally {
      setIsBookEntrySubmitting(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {isBookEntryModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1200,
          }}
        >
          <div
            style={{
              width: 'min(980px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 20,
              border: '1px solid rgba(126,242,255,0.22)',
              background: 'linear-gradient(180deg, rgba(18,24,47,0.98), rgba(11,16,34,0.98))',
              boxShadow: '0 28px 80px rgba(0,0,0,0.45)',
              padding: 22,
              display: 'grid',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Book-Entry Security Intake</div>
              <div style={{ color: '#cbd5e1', marginTop: 6, lineHeight: 1.6 }}>
                Upload county registrar or depository support, match the security pool, then push the holding into asset reserve with its evidence attached.
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Entity</span>
                <select
                  value={bookEntryDraft.entityId}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, entityId: event.target.value }))
                  }
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                >
                  <option value="">Select entity</option>
                  {data.entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.displayName || entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Registrar Office</span>
                <input
                  value={bookEntryDraft.registrarOffice}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, registrarOffice: event.target.value }))
                  }
                  placeholder="County registrar, transfer agent..."
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>County</span>
                <input
                  value={bookEntryDraft.county}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, county: event.target.value }))
                  }
                  placeholder="County"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>State</span>
                <input
                  value={bookEntryDraft.state}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, state: event.target.value }))
                  }
                  placeholder="State"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recorder Book</span>
                <input
                  value={bookEntryDraft.recorderBook}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, recorderBook: event.target.value }))
                  }
                  placeholder="Book / volume"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recorder Page</span>
                <input
                  value={bookEntryDraft.recorderPage}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, recorderPage: event.target.value }))
                  }
                  placeholder="Page"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Sticker Ref / BK-PG</span>
                <input
                  value={bookEntryDraft.recordingStickerReference}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      recordingStickerReference: event.target.value,
                    }))
                  }
                  placeholder="BK/PG, RB522/51-54..."
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recording Number</span>
                <input
                  value={bookEntryDraft.recordingNumber}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      recordingNumber: event.target.value,
                    }))
                  }
                  placeholder="22005433..."
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recorded At</span>
                <input
                  type="datetime-local"
                  value={bookEntryDraft.recordedAt}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      recordedAt: event.target.value,
                    }))
                  }
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recorded Document Type</span>
                <input
                  value={bookEntryDraft.recordingDocumentType}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      recordingDocumentType: event.target.value,
                    }))
                  }
                  placeholder="Warranty deed, oath of consideration..."
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Recorder Name</span>
                <input
                  value={bookEntryDraft.recorderName}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      recorderName: event.target.value,
                    }))
                  }
                  placeholder="Lori Jones..."
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Book-Entry Identifier</span>
                <input
                  value={bookEntryDraft.bookEntryIdentifier}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      bookEntryIdentifier: event.target.value,
                    }))
                  }
                  placeholder="Registrar / book-entry identifier"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Security Pool Name</span>
                <input
                  value={bookEntryDraft.securityPoolName}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      securityPoolName: event.target.value,
                    }))
                  }
                  placeholder="Bond or pool name"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Issuer</span>
                <input
                  value={bookEntryDraft.issuerName}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, issuerName: event.target.value }))
                  }
                  placeholder="Issuer / obligor"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Identifier Code</span>
                <input
                  value={bookEntryDraft.identifierCode}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, identifierCode: event.target.value }))
                  }
                  placeholder="CUSIP / internal identifier"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>ISIN</span>
                <input
                  value={bookEntryDraft.isinCode}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, isinCode: event.target.value }))
                  }
                  placeholder="ISIN"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Market Sector</span>
                <select
                  value={bookEntryDraft.marketSector}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      marketSector: event.target.value as BookEntrySecurityDraft['marketSector'],
                    }))
                  }
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                >
                  <option value="municipal">Municipal</option>
                  <option value="corporate">Corporate</option>
                  <option value="sovereign">Sovereign</option>
                  <option value="private">Private</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Search / Depository Source</span>
                <select
                  value={bookEntryDraft.depositorySource}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      depositorySource: event.target.value as DepositorySource,
                    }))
                  }
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                >
                  {securityMerchantCatalog
                    .filter((source) =>
                      [
                        'internal_bonded_pool',
                        'dtcc',
                        'emma',
                        'openfigi',
                        'treasurydirect',
                        'fidelity',
                        'henion_walsh',
                        'court_cris',
                        'tops',
                        'court_docket',
                        'sec_edgar',
                        'manual',
                      ].includes(source.key),
                    )
                    .map((source) => (
                      <option key={source.key} value={source.key}>
                        {source.label}
                      </option>
                    ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Depository Reference</span>
                <input
                  value={bookEntryDraft.depositoryReference}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      depositoryReference: event.target.value,
                    }))
                  }
                  placeholder="DTCC / EMMA / transfer reference"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Coupon Rate</span>
                <input
                  value={bookEntryDraft.couponRate}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, couponRate: event.target.value }))
                  }
                  placeholder="5.25"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Maturity Date</span>
                <input
                  type="date"
                  value={bookEntryDraft.maturityDate}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, maturityDate: event.target.value }))
                  }
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Par Value</span>
                <input
                  value={bookEntryDraft.parValue}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, parValue: event.target.value }))
                  }
                  placeholder="100000"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Market Value</span>
                <input
                  value={bookEntryDraft.marketValue}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, marketValue: event.target.value }))
                  }
                  placeholder="99000"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Units</span>
                <input
                  value={bookEntryDraft.units}
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({ ...prev, units: event.target.value }))
                  }
                  placeholder="1"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Upload Sticker / Support</span>
                <input
                  type="file"
                  onChange={(event) =>
                    setBookEntryDraft((prev) => ({
                      ...prev,
                      uploadedFile: event.target.files?.[0] || null,
                    }))
                  }
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.doc,.docx"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(10, 11, 24, 0.78)',
                    color: '#fff6fd',
                    padding: '10px 12px',
                    fontSize: 14,
                  }}
                />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Sticker Fee Breakdown</span>
              <textarea
                value={bookEntryDraft.feeBreakdownText}
                onChange={(event) =>
                  setBookEntryDraft((prev) => ({
                    ...prev,
                    feeBreakdownText: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Transfer tax, recording fee, archive fee, total..."
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(10, 11, 24, 0.78)',
                  color: '#fff6fd',
                  padding: '10px 12px',
                  fontSize: 14,
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Notes</span>
              <textarea
                value={bookEntryDraft.notes}
                onChange={(event) =>
                  setBookEntryDraft((prev) => ({ ...prev, notes: event.target.value }))
                }
                rows={4}
                placeholder="County reference, pool notes, servicing remarks, or reserve treatment details"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(10, 11, 24, 0.78)',
                  color: '#fff6fd',
                  padding: '10px 12px',
                  fontSize: 14,
                }}
              />
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#e5e7eb' }}>
              <input
                type="checkbox"
                checked={bookEntryDraft.createInstrument}
                onChange={(event) =>
                  setBookEntryDraft((prev) => ({
                    ...prev,
                    createInstrument: event.target.checked,
                  }))
                }
              />
              Also maintain a linked security instrument record for this reserve holding
            </label>
            <div
              style={{
                borderRadius: 16,
                border: '1px solid rgba(126,242,255,0.18)',
                background: 'rgba(54,215,255,0.06)',
                padding: 14,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800 }}>Pool Match Selection</div>
              <div style={{ color: '#cbd5e1', lineHeight: 1.55 }}>
                Select the matched bond or security pool before adding it into reserve. Existing reserve assets and bond-like instruments are ranked first when the identifier, issuer, or pool name lines up.
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {bookEntryCandidates.map((candidate) => (
                  <label
                    key={candidate.id}
                    style={{
                      display: 'grid',
                      gap: 4,
                      padding: 12,
                      borderRadius: 12,
                      border:
                        bookEntryDraft.selectedCandidateId === candidate.id
                          ? '1px solid rgba(126,242,255,0.34)'
                          : '1px solid rgba(148,163,184,0.18)',
                      background:
                        bookEntryDraft.selectedCandidateId === candidate.id
                          ? 'rgba(54,215,255,0.12)'
                          : 'rgba(15,23,42,0.36)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input
                        type="radio"
                        checked={bookEntryDraft.selectedCandidateId === candidate.id}
                        onChange={() =>
                          setBookEntryDraft((prev) => ({
                            ...prev,
                            selectedCandidateId: candidate.id,
                          }))
                        }
                      />
                      <strong>{candidate.label}</strong>
                    </span>
                    <span style={{ color: '#cbd5e1', fontSize: 13 }}>{candidate.subtitle}</span>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>
                      Match reason: {candidate.matchReason}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div
              style={{
                borderRadius: 16,
                border: '1px solid rgba(96,165,250,0.18)',
                background: 'rgba(37,99,235,0.08)',
                padding: 14,
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 800 }}>DTCC Connector Posture</div>
              <div style={{ color: '#cbd5e1', lineHeight: 1.55 }}>
                {dtccConnector?.conversionRole ||
                  'DTCC lookup posture is not loaded in the connector catalog.'}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>
                {dtccConnector?.nextSetupStep || 'Complete DTCC client onboarding and product mapping for live depository search.'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsBookEntryModalOpen(false)}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.22)',
                  background: 'rgba(15,23,42,0.46)',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBookEntrySubmit()}
                style={{
                  padding: '10px 14px',
                  minHeight: 42,
                  borderRadius: 10,
                  border: '1px solid rgba(126,242,255,0.28)',
                  background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 800,
                  opacity: isBookEntrySubmitting ? 0.82 : 1,
                }}
              >
                {isBookEntrySubmitting ? 'Saving Security...' : 'Add To Asset Reserve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div>
        <h1 style={{ marginTop: 0, fontSize: 30 }}>Assets & Reserve</h1>
        <p style={{ color: 'var(--cf-muted)', marginBottom: 0 }}>
          Traditional assets, digital assets, treasury-linked wallets, and smart-contract positions.
        </p>
      </div>

      <PageSection
        title="Book-Entry Securities Rail"
        description="Upload registrar or depository evidence, select the matched bond or pool, and place the resulting holding into asset reserve with linked source support."
      >
        <div style={{ display: 'grid', gap: 14 }}>
          {bookEntryNotice ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(96,165,250,0.24)',
                background: 'rgba(30,41,59,0.4)',
                color: '#bfdbfe',
                lineHeight: 1.55,
              }}
            >
              {bookEntryNotice}
            </div>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <WorkbenchRecordCard
              title="Reserve Intake"
              subtitle="County registrar, transfer-agent, or depository support"
              actionSlot={
                <button
                  type="button"
                  onClick={openBookEntryModal}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(126,242,255,0.28)',
                    background: 'rgba(54,215,255,0.12)',
                    color: '#effcff',
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  Upload Book-Entry Security
                </button>
              }
            >
              Capture registrar book-entry identifiers, pool details, CUSIP or ISIN references, and depository evidence before the security is placed into reserve.
            </WorkbenchRecordCard>
            <WorkbenchRecordCard
              title="DTCC Mapping"
              subtitle={dtccConnector?.label || 'DTCC connector'}
              summaryItems={[
                { label: 'Access', value: dtccConnector?.access || 'not set' },
                { label: 'Posture', value: dtccConnector?.executionPosture || 'not set' },
                { label: 'Category', value: dtccConnector?.category || 'not set' },
              ]}
            >
              {dtccConnector?.bestUse ||
                'Use this rail for depository and post-trade context once live client onboarding is in place.'}
            </WorkbenchRecordCard>
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Reserve Command Strip"
        description="Use the left sidebar to switch desks. This desk starts with live reserve/custody totals, then detailed assets, wallets, trust funding, and liquidation sections."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            'Wallets and custody',
            'Metals and titled assets',
            'Collateral and bonds',
            'Trust funding',
            'Liquidation posture',
          ].map((label) => (
            <span
              key={label}
              style={{
                padding: '8px 10px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.18)',
                background: 'rgba(15,23,42,0.28)',
                color: '#d1d5db',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </PageSection>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Traditional Assets" value={data.assets.length} />
        <StatCard label="Marketable Paper" value={marketableAssets.length + marketableInstruments.length} />
        <StatCard label="Municipal / Fixed Income" value={municipalCount} />
        <StatCard label="Disclosure Reviews" value={municipalDisclosureReviews.length} />
        <StatCard label="Event Watch" value={municipalEventWatchCount} />
        <StatCard label="Borrowing Facilities" value={data.borrowingFacilities.length} />
        <StatCard label="Collateral Holdings" value={data.collateralHoldings.length} />
        <StatCard label="Futures Strategies" value={data.futuresStrategies.length} />
        <StatCard label="Liquidation Plans" value={data.liquidationPlans.length} />
        <StatCard label="RE Security Reviews" value={realEstateSecuritySummary.reviews.length} />
        <StatCard label="Asset Purchases" value={assetAcquisitionViews.length} />
        <StatCard label="Collateral Conversions" value={collateralConversionViews.length} />
        <StatCard label="Conversion Connectors" value={conversionConnectors.length} />
        <StatCard label="Mail Presentments" value={treasuryPresentmentMailTodos.length} />
        <StatCard
          label="Cash-Available Conversions"
          value={collateralConversionViews.filter((item) => item.cashAvailable).length}
        />
        <StatCard
          label="Ready Purchases"
          value={assetAcquisitionViews.filter((item) => item.blockers.length === 0).length}
        />
        <StatCard label="Property Acquisitions" value={realPropertyAcquisitionViews.length} />
        <StatCard
          label="Clear To Close"
          value={realPropertyAcquisitionViews.filter((item) => item.closingReady).length}
        />
        <StatCard label="High Howey Risk" value={realEstateSecuritySummary.highRiskCount} />
        <StatCard label="Trust Funding Files" value={trustFundingViews.length} />
        <StatCard label="Metal / Jewelry Assets" value={preciousMetalAssets.length} />
        <StatCard label="Digital Assets" value={data.digitalAssets.length} />
        <StatCard label="Wallets" value={data.wallets.length} />
        <StatCard label="Smart Contract Positions" value={data.smartContractPositions.length} />
        <StatCard label="Assigned Tokens" value={data.tokens.length} />
      </div>

      <PageSection
        title="Real Estate Securities Review"
        description="Issue-spot pooled-income, manager-control, guaranteed-return, occupancy-restriction, and private-placement posture before a real-estate deal is treated like ordinary title paper."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <StatCard label="Deals In Review" value={realEstateSecuritySummary.reviews.length} />
          <StatCard label="High Risk" value={realEstateSecuritySummary.highRiskCount} />
          <StatCard label="Watch" value={realEstateSecuritySummary.watchCount} />
          <StatCard label="Private Placement Files" value={realEstateSecuritySummary.privatePlacementCount} />
          <StatCard label="Rental Pool Deals" value={realEstateSecuritySummary.pooledIncomeCount} />
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {realEstateSecuritySummary.reviews.length === 0 ? (
            <WorkbenchRecordCard
              title="No real-estate securities reviews yet"
              subtitle="Capture pooling, manager, and offering posture when title paper starts to behave like a security"
            >
              Use advanced edit on real-estate assets or instruments to record rental pools, guaranteed returns, occupancy restrictions, exclusive management, and private-placement posture.
            </WorkbenchRecordCard>
          ) : null}

          {realEstateSecuritySummary.reviews.map((review) => (
            <WorkbenchRecordCard
              key={review.id}
              title={review.label}
              subtitle={`${review.sourceType} | ${review.offeringStructure} | ${review.securitiesRiskLevel}`}
              summaryItems={[
                { label: 'Flags', value: review.flags.join(' | ') || 'Manager / offering review only' },
                { label: 'Private Placement', value: review.privatePlacementSupportNeeded ? 'Needed' : 'Not flagged' },
                { label: 'Accredited Investor', value: review.accreditedInvestorSupportNeeded ? 'Required / watch' : 'Not flagged' },
                {
                  label: 'Occupancy Restriction',
                  value: review.occupancyRestrictionDaysPerYear
                    ? `${review.occupancyRestrictionDaysPerYear} days`
                    : 'Not tracked',
                },
              ]}
            >
              {review.summary}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Real Property Acquisition Rails"
        description="Title-company closings normally require verified wire instructions and bank-originated Fedwire release. Entity-issued notes can support the acquisition only when accepted by the seller, title company, or closing instructions."
      >
        {realPropertyAcquisitionViews.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {realPropertyAcquisitionViews.map((view) => (
              <div
                key={view.assetId}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.28)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>{view.propertyLabel}</div>
                    <div style={{ color: '#94a3b8', marginTop: 4 }}>
                      {view.titleCompany} | {view.acquisitionStatus?.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={statusPillStyle(view.wireReady)}>Wire {view.wireReady ? 'ready' : 'pending'}</span>
                    <span style={statusPillStyle(view.noteReady)}>Note {view.noteReady ? 'accepted' : 'review'}</span>
                    <span style={statusPillStyle(view.closingReady)}>
                      {view.closingReady ? 'Clear to close' : 'Needs proof'}
                    </span>
                  </div>
                </div>
                <div style={{ color: '#d1d5db', lineHeight: 1.55 }}>
                  Preferred rail: <strong>{view.preferredRail}</strong>. Purchase price:{' '}
                  <strong>{formatMoney(view.purchasePrice)}</strong>. Next: {view.nextAction}
                </div>
                {view.blockers.length ? (
                  <div style={{ color: '#fca5a5', display: 'grid', gap: 4 }}>
                    {view.blockers.map((blocker) => (
                      <div key={blocker}>- {blocker}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
            No real property acquisition profiles are active yet. Add or edit a real-estate asset with purchase,
            title-company, wire, note, and closing proof details to activate this rail view.
          </div>
        )}
      </PageSection>

      <PageSection
        title="Registered Mail Presentment To-Do"
        description="When an executed note, bond, or instrument must be physically presented, use this queue to generate the cover letter, mail packet checklist, USPS/EPS proof path, and returned-response evidence trail."
      >
        {treasuryPresentmentMailTodos.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {treasuryPresentmentMailTodos.map((todo) => (
              <WorkbenchRecordCard
                key={todo.id}
                title={todo.title}
                subtitle={`${todo.entityLabel} | ${todo.status.replace(/_/g, ' ')}`}
                summaryItems={[
                  { label: 'Recipient', value: todo.recipientLabel },
                  { label: 'Identifier', value: todo.legalIdentifier || 'not set' },
                  { label: 'Amount', value: formatMoney(todo.amount) },
                ]}
              >
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ color: '#d1d5db', lineHeight: 1.6 }}>{todo.nextStep}</div>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid rgba(148,163,184,0.18)',
                      background: 'rgba(15,23,42,0.3)',
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>All-inclusive presentment instructions</div>
                    <div style={{ display: 'grid', gap: 5, color: '#cbd5e1', lineHeight: 1.5 }}>
                      {todo.checklist.map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                  <details
                    style={{
                      borderRadius: 12,
                      border: '1px solid rgba(96,165,250,0.24)',
                      background: 'rgba(37,99,235,0.12)',
                      padding: 12,
                    }}
                  >
                    <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#bfdbfe' }}>
                      Generated cover letter / form text
                    </summary>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        margin: '12px 0 0',
                        color: '#dbeafe',
                        fontFamily: 'inherit',
                        lineHeight: 1.55,
                      }}
                    >
                      {todo.coverLetterBody}
                    </pre>
                  </details>
                </div>
              </WorkbenchRecordCard>
            ))}
          </div>
        ) : (
          <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
            No executed notes, bonds, or instruments are currently waiting on registered/certified mail
            presentment. Once an issued instrument needs outside treasury or receiving-office presentment, it will
            appear here with mailing instructions, USPS/EPS evidence steps, and generated cover letter text.
          </div>
        )}
      </PageSection>

      <PageSection
        title="Collateral Conversion Rails"
        description="Move pledged assets, metals, securities, notes, receivables, digital assets, and reserve property from tracked collateral into verified cash only after provider, custody, sale, and bank receipt proof are retained."
      >
        {collateralConversionViews.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {collateralConversionViews.map((view) => (
              <div
                key={view.assetId}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.28)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>{view.assetLabel}</div>
                    <div style={{ color: '#94a3b8', marginTop: 4 }}>
                      {view.entityLabel} | {view.sourceClass.replace(/_/g, ' ')} | {view.status.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={statusPillStyle(view.providerConnectionStatus !== 'not_connected')}>Provider</span>
                    <span style={statusPillStyle(view.custodyProofReady)}>Custody</span>
                    <span style={statusPillStyle(view.saleProofReady)}>Sale proof</span>
                    <span style={statusPillStyle(view.cashReceiptReady)}>Cash receipt</span>
                  </div>
                </div>
                <div style={{ color: '#d1d5db', lineHeight: 1.55 }}>
                  Provider: <strong>{view.providerLabel}</strong>. Destination:{' '}
                  <strong>{view.destinationLabel}</strong>. Net proceeds:{' '}
                  <strong>{formatMoney(view.estimatedNetProceeds)}</strong>. Next: {view.nextAction}
                </div>
                <div style={{ color: '#cbd5e1', lineHeight: 1.55 }}>
                  SEC/Treasury/private-offering reference:{' '}
                  <strong>{view.securitiesReferenceReady ? 'ready or not required' : 'needed before securities-backed conversion'}</strong>.
                </div>
                {view.blockers.length ? (
                  <div style={{ color: '#fca5a5', display: 'grid', gap: 4 }}>
                    {view.blockers.map((blocker) => (
                      <div key={blocker}>- {blocker}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
            No collateral conversion rails are active yet. Add a collateral conversion profile to a metal, security,
            note, receivable, digital asset, real property, equipment, or reserve asset when it needs to become
            bank-recognized cash for inter-entity funding, acquisition wires, checks, or treasury release.
          </div>
        )}
      </PageSection>

      <PageSection
        title="Conversion Connector Directory"
        description="Use these as the practical rails for turning contracts, debt instruments, collateral, and reserve assets into externally recognized cash. ClearFlow should only mark cash available after the relevant provider, custodian, broker, bank, escrow, or treasury proof is retained."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {conversionConnectors.map((connector) => (
            <WorkbenchRecordCard
              key={connector.key}
              title={connector.label}
              subtitle={`${connector.category.replace(/_/g, ' ')} | ${connector.executionPosture.replace(/_/g, ' ')}`}
              summaryItems={[
                { label: 'Access', value: connector.access.replace(/_/g, ' ') },
                { label: 'Use', value: connector.bestUse },
              ]}
            >
              <div style={{ display: 'grid', gap: 8 }}>
                <div>{connector.conversionRole}</div>
                <div style={{ color: '#cbd5e1' }}>Next setup: {connector.nextSetupStep}</div>
                <a
                  href={connector.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#7dd3fc', fontWeight: 800 }}
                >
                  Open official connector reference
                </a>
              </div>
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Capital Asset Purchase Rails"
        description="Heavy equipment, fleet vehicles, land, materials, inventory, aircraft, marine assets, and supplier purchases can route through verified seller instructions, escrow, dealer portals, equipment finance, or bank wires."
      >
        {assetAcquisitionViews.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {assetAcquisitionViews.map((view) => (
              <div
                key={view.assetId}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.28)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>{view.assetLabel}</div>
                    <div style={{ color: '#94a3b8', marginTop: 4 }}>
                      {view.acquisitionClass?.replace(/_/g, ' ')} | {view.sellerOrSupplier}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={statusPillStyle(view.instructionReady)}>Instructions</span>
                    <span style={statusPillStyle(view.collateralReady)}>Collateral</span>
                    <span style={statusPillStyle(view.settlementReady)}>Settlement</span>
                  </div>
                </div>
                <div style={{ color: '#d1d5db', lineHeight: 1.55 }}>
                  Rail: <strong>{view.preferredRail}</strong>
                  {view.preferredProvider ? (
                    <>
                      {' '}
                      through <strong>{view.preferredProvider.replace(/_/g, ' ')}</strong>
                    </>
                  ) : null}
                  . Purchase amount: <strong>{formatMoney(view.purchaseAmount)}</strong>. Next: {view.nextAction}
                </div>
                {view.blockers.length ? (
                  <div style={{ color: '#fca5a5', display: 'grid', gap: 4 }}>
                    {view.blockers.map((blocker) => (
                      <div key={blocker}>- {blocker}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
            No capital asset purchase profiles are active yet. Add an acquisition profile to equipment, fleet,
            materials, land, inventory, aircraft, or marine assets to activate purchase rail readiness.
          </div>
        )}
      </PageSection>

      <PageSection
        title="Trust Funding & Income Rails"
        description="See whether each trust is actually funded to operate, where the liquid and titled support sits, and how much governing support is available to drive fiduciary accounting."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {trustFundingViews.length === 0 ? (
            <WorkbenchRecordCard title="No trust funding rails yet" subtitle="Add a trust entity to begin">
              Once a trust exists, ClearFlow will read its bank balances, reserve accounts, titled assets, income-bearing paper, and uploaded governing records together so administration is based on actual funding instead of assumptions.
            </WorkbenchRecordCard>
          ) : (
            trustFundingViews.map((view) => (
              <WorkbenchRecordCard
                key={view.entity.id}
                title={view.entity.displayName || view.entity.name}
                subtitle={`trust | ${view.readiness}`}
                summaryItems={[
                  { label: 'Liquid Funding', value: view.liquidFunding.toLocaleString() },
                  { label: 'Reserve Funding', value: view.reserveFunding.toLocaleString() },
                  { label: 'Titled Assets', value: view.titledAssetValue.toLocaleString() },
                  { label: 'Income-Bearing', value: view.incomeBearingValue.toLocaleString() },
                  { label: 'Governing Docs', value: String(view.governingDocumentCount) },
                  { label: 'All Trust Docs', value: String(view.trustDocumentCount) },
                ]}
              >
                {view.summary}
              </WorkbenchRecordCard>
            ))
          )}
        </div>
      </PageSection>

      <PageSection
        title="Precious Metal & Bond Collateral"
        description="Track gold, silver, jewelry, and other specifically identified pledged items so bond collateral is visibly allocated, held, and liquidation-ready."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {preciousMetalAssets.length === 0 ? (
            <WorkbenchRecordCard title="No precious-metal collateral recorded yet" subtitle="Add gold, silver, jewelry, or other held collateral">
              Enter each metal or jewelry asset with quantity, unit, identifiers, and custody details, then link it into a collateral holding or bond so liquidation and allocation stay specific instead of generic.
            </WorkbenchRecordCard>
          ) : (
            preciousMetalAssets.map((asset) => (
              <WorkbenchRecordCard
                key={asset.id}
                title={asset.name}
                subtitle={`${asset.preciousMetalProfile?.metalType || asset.category} | ${asset.status}`}
                summaryItems={[
                  {
                    label: 'Quantity',
                    value:
                      typeof asset.preciousMetalProfile?.quantity === 'number'
                        ? `${asset.preciousMetalProfile.quantity} ${asset.preciousMetalProfile.unitOfMeasure || ''}`.trim()
                        : 'Not set',
                  },
                  { label: 'Identifiers', value: asset.preciousMetalProfile?.itemIdentifiers?.join(', ') || asset.identifierCode || 'Not set' },
                  { label: 'Storage', value: asset.preciousMetalProfile?.storageLocation || 'Not set' },
                  { label: 'Liquidation', value: asset.preciousMetalProfile?.liquidationReadiness || 'review' },
                  { label: 'Market Value', value: asset.marketValue?.toLocaleString() || asset.bookValue.toLocaleString() },
                ]}
                record={asset}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    assets: prev.assets.map((item) => (item.id === asset.id ? nextRecord : item)),
                  }))
                }
              >
                {asset.notes || 'Use advanced edit to maintain fineness, hallmark, custody, and item-specific collateral identifiers.'}
              </WorkbenchRecordCard>
            ))
          )}

          {data.collateralHoldings
            .filter(
              (holding) =>
                holding.collateralType === 'bond' ||
                holding.pledgedItems?.some((item) => item.metalType || item.identifier),
            )
            .map((holding) => (
              <WorkbenchRecordCard
                key={holding.id}
                title={holding.holdingLabel}
                subtitle={`${holding.collateralType} | ${holding.status}`}
                summaryItems={[
                  { label: 'Pledged Items', value: String(holding.pledgedItemCount || holding.pledgedItems?.length || 0) },
                  { label: 'Market Value', value: holding.marketValue.toLocaleString() },
                  { label: 'Lendable', value: (holding.lendableValue ?? holding.marketValue).toLocaleString() },
                  { label: 'Bond Link', value: holding.linkedInstrumentId || 'Not linked' },
                ]}
                record={holding}
                onSave={(nextRecord) =>
                  setData((prev) => ({
                    ...prev,
                    collateralHoldings: prev.collateralHoldings.map((item) =>
                      item.id === holding.id ? nextRecord : item,
                    ),
                  }))
                }
              >
                {holding.pledgedItemSummary ||
                  holding.pledgedItems
                    ?.map((item) =>
                      [
                        typeof item.quantity === 'number' ? item.quantity : undefined,
                        item.unitOfMeasure,
                        item.metalType,
                        item.label,
                        item.identifier,
                      ]
                        .filter(Boolean)
                        .join(' '),
                    )
                    .join(' | ') ||
                  'Use advanced edit to allocate individual metal or jewelry items into this collateral pool.'}
              </WorkbenchRecordCard>
            ))}
        </div>
      </PageSection>

      <PageSection
        title="Capital & Liquidation Rails"
        description="Borrowing exposure, pledged collateral, futures overlays, and liquidation planning tied back into treasury and ERP cashflow."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <StatCard label="Borrowed / Drawn" value={capitalSummary.activeBorrowingExposure.toLocaleString()} />
          <StatCard label="Borrowing Capacity" value={capitalSummary.availableBorrowingCapacity.toLocaleString()} />
          <StatCard label="Pledged Collateral" value={capitalSummary.pledgedCollateralValue.toLocaleString()} />
          <StatCard label="Coverage Value" value={capitalSummary.collateralCoverageValue.toLocaleString()} />
          <StatCard label="Futures Notional" value={capitalSummary.activeFuturesNotional.toLocaleString()} />
          <StatCard label="Futures Margin" value={capitalSummary.activeFuturesMargin.toLocaleString()} />
          <StatCard label="Liquidation Target" value={capitalSummary.liquidationTargetAmount.toLocaleString()} />
          <StatCard label="Blocked Plans" value={capitalSummary.blockedLiquidationCount} />
        </div>
      </PageSection>

      <WalletConnectionWorkspace data={data} setData={setData} />

      <PageSection
        title="Borrowing & Collateral"
        description="Facilities, collateral support, and borrowing capacity for working capital, bond purchases, and reserve-backed cashflow."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.borrowingFacilities.map((facility) => (
            <WorkbenchRecordCard
              key={facility.id}
              title={facility.facilityName}
              subtitle={`${facility.facilityType} | ${facility.status}`}
              summaryItems={[
                { label: 'Lender', value: facility.lenderName || 'Internal / not set' },
                { label: 'Commitment', value: facility.commitmentAmount.toLocaleString() },
                { label: 'Drawn', value: facility.drawnAmount.toLocaleString() },
                {
                  label: 'Available',
                  value: (facility.availableAmount ?? Math.max(0, facility.commitmentAmount - facility.drawnAmount)).toLocaleString(),
                },
                { label: 'Rate / Maturity', value: facility.interestRate ? `${facility.interestRate}% | ${facility.maturityDate || 'no maturity'}` : facility.maturityDate || 'not set' },
              ]}
              record={facility}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  borrowingFacilities: prev.borrowingFacilities.map((item) =>
                    item.id === facility.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {facility.notes || facility.collateralRequirement || 'Maintain facility, lender, and collateral support details here.'}
            </WorkbenchRecordCard>
          ))}

          {data.collateralHoldings.map((holding) => (
            <WorkbenchRecordCard
              key={holding.id}
              title={holding.holdingLabel}
              subtitle={`${holding.collateralType} | ${holding.status}`}
              summaryItems={[
                { label: 'Market Value', value: holding.marketValue.toLocaleString() },
                {
                  label: 'Lendable Value',
                  value: (holding.lendableValue ?? holding.marketValue).toLocaleString(),
                },
                { label: 'Advance Rate', value: holding.advanceRate ? `${holding.advanceRate}%` : 'not set' },
                { label: 'Margin', value: holding.marginRequirement?.toLocaleString() || 'not set' },
                { label: 'Priority', value: String(holding.liquidationPriority ?? 'not set') },
              ]}
              record={holding}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  collateralHoldings: prev.collateralHoldings.map((item) =>
                    item.id === holding.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {holding.notes || 'Use advanced edit to maintain pledge, margin, and liquidation priority details.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Futures & Liquidation Planning"
        description="Overlay strategies and liquidation paths that feed credits, purchases, and working-capital decisions."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.futuresStrategies.map((strategy) => (
            <WorkbenchRecordCard
              key={strategy.id}
              title={strategy.strategyName}
              subtitle={`${strategy.strategyType} | ${strategy.status} | ${strategy.positionSide}`}
              summaryItems={[
                { label: 'Underlying', value: strategy.underlyingExposure },
                { label: 'Contract', value: strategy.contractCode || strategy.contractMarket || 'not set' },
                { label: 'Notional', value: strategy.notionalExposure.toLocaleString() },
                { label: 'Margin', value: strategy.marginPosted.toLocaleString() },
                {
                  label: 'P&L',
                  value: `${(strategy.realizedPnl || 0).toLocaleString()} / ${(strategy.unrealizedPnl || 0).toLocaleString()}`,
                },
              ]}
              record={strategy}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  futuresStrategies: prev.futuresStrategies.map((item) =>
                    item.id === strategy.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {strategy.notes || 'Use advanced edit to maintain hedge purpose, margin posture, and linked treasury accounts.'}
            </WorkbenchRecordCard>
          ))}

          {data.liquidationPlans.map((plan) => (
            <WorkbenchRecordCard
              key={plan.id}
              title={plan.planName}
              subtitle={`${plan.objective} | ${plan.status}`}
              summaryItems={[
                { label: 'Target', value: plan.targetAmount.toLocaleString() },
                { label: 'Projected Proceeds', value: (plan.projectedNetProceeds ?? plan.targetAmount).toLocaleString() },
                { label: 'Method', value: plan.liquidationMethod || 'manual review' },
                { label: 'Settlement Path', value: plan.settlementPathPreference || 'not set' },
                { label: 'Linked Futures', value: String(plan.linkedFuturesStrategyIds?.length || 0) },
              ]}
              record={plan}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  liquidationPlans: prev.liquidationPlans.map((item) =>
                    item.id === plan.id ? nextRecord : item,
                  ),
                }))
              }
            >
              {plan.notes || 'Use advanced edit to keep liquidation sequencing and proceeds assumptions current.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Marketable Securities & Muni Ledger"
        description="Track municipal paper, reserve bonds, identifiers, coupon and maturity data, and liquidity posture without leaving the asset desk."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {marketableAssets.length === 0 && marketableInstruments.length === 0 ? (
            <WorkbenchRecordCard title="No marketable paper tracked yet" subtitle="Add securities into the reserve ledger">
              Use identifiers, issuer details, coupon, maturity, tax treatment, and liquidity posture so reserve paper can be searched and reported cleanly.
            </WorkbenchRecordCard>
          ) : null}

          {marketableAssets.map((asset) => (
            <WorkbenchRecordCard
              key={asset.id}
              title={asset.name}
              subtitle={`${asset.marketSector || asset.category} | ${asset.taxTreatment || 'tax posture not set'}`}
              summaryItems={[
                { label: 'Identifier', value: asset.identifierCode || 'Not assigned' },
                { label: 'Issuer', value: asset.issuerName || 'Not assigned' },
                {
                  label: 'Coupon / Maturity',
                  value: asset.couponRate
                    ? `${asset.couponRate}% | ${asset.maturityDate || 'No maturity'}`
                    : asset.maturityDate || 'Not set',
                },
                {
                  label: 'Book Entry / Depository',
                  value:
                    asset.bookEntryReserveProfile?.bookEntryIdentifier ||
                    asset.bookEntryReserveProfile?.depositoryReference
                      ? `${asset.bookEntryReserveProfile?.bookEntryIdentifier || 'no book-entry id'} | ${asset.bookEntryReserveProfile?.depositoryReference || asset.bookEntryReserveProfile?.depositorySource || 'no depository ref'}`
                      : 'Not linked',
                },
                {
                  label: 'Recorder Sticker',
                  value:
                    asset.bookEntryReserveProfile?.recordingStickerReference ||
                    asset.bookEntryReserveProfile?.recordingNumber
                      ? `${asset.bookEntryReserveProfile?.recordingStickerReference || 'no ref'} | ${asset.bookEntryReserveProfile?.recordingNumber || 'no recording #'}`
                      : 'Not captured',
                },
                { label: 'Liquidity', value: asset.liquidityProfile || 'Not reviewed' },
                { label: 'Rating', value: asset.creditRating || 'Not tracked' },
                { label: 'Market Value', value: asset.marketValue?.toLocaleString() || 'Not tracked' },
              ]}
              record={asset}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  assets: prev.assets.map((item) => (item.id === asset.id ? nextRecord : item)),
                }))
              }
              actionSlot={
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#aiStudio';
                  }}
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
                  Open Muni Research
                </button>
              }
            >
              {asset.notes || 'Use advanced edit to maintain identifier, issuer, tax treatment, and liquidity review details.'}
            </WorkbenchRecordCard>
          ))}

          {marketableInstruments.map((instrument) => (
            <WorkbenchRecordCard
              key={instrument.id}
              title={instrument.title}
              subtitle={`${instrument.marketSector || instrument.sourceClass || instrument.instrumentType} | ${instrument.taxTreatment || 'tax posture not set'}`}
              summaryItems={[
                { label: 'Legal ID', value: instrument.legalIdentifier || 'Not assigned' },
                { label: 'Market ID', value: instrument.identifierCode || 'Not assigned' },
                { label: 'Issuer', value: instrument.issuerName || 'Internal / not set' },
                {
                  label: 'Coupon / Maturity',
                  value: instrument.couponRate
                    ? `${instrument.couponRate}% | ${instrument.maturityDate || 'No maturity'}`
                    : instrument.maturityDate || 'Not set',
                },
                {
                  label: 'Book Entry / Depository',
                  value:
                    instrument.bookEntryReserveProfile?.bookEntryIdentifier ||
                    instrument.bookEntryReserveProfile?.depositoryReference
                      ? `${instrument.bookEntryReserveProfile?.bookEntryIdentifier || 'no book-entry id'} | ${instrument.bookEntryReserveProfile?.depositoryReference || instrument.bookEntryReserveProfile?.depositorySource || 'no depository ref'}`
                      : 'Not linked',
                },
                {
                  label: 'Recorder Sticker',
                  value:
                    instrument.bookEntryReserveProfile?.recordingStickerReference ||
                    instrument.bookEntryReserveProfile?.recordingNumber
                      ? `${instrument.bookEntryReserveProfile?.recordingStickerReference || 'no ref'} | ${instrument.bookEntryReserveProfile?.recordingNumber || 'no recording #'}`
                      : 'Not captured',
                },
                { label: 'Liquidity', value: instrument.liquidityProfile || 'Not reviewed' },
                { label: 'Rating', value: instrument.creditRating || 'Not tracked' },
              ]}
              record={instrument}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  instruments: prev.instruments.map((item) =>
                    item.id === instrument.id ? nextRecord : item
                  ),
                }))
              }
            >
              {instrument.notes || 'Use advanced edit to maintain issuer, identifier, liquidity, and reserve posture details.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Disclosure & Event Watch"
        description="Work municipal disclosure review, EMMA follow-through, and event-notice posture directly from the asset ledger."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.municipalDisclosures.length === 0 && data.municipalEventNotices.length === 0 ? (
            <WorkbenchRecordCard
              title="No disclosure watch records yet"
              subtitle="Start municipal intake from AI Studio"
            >
              Use the CUSIP / EMMA intake tool to create disclosure review records, event-watch starters, and supporting packets for securities entering the ledger.
            </WorkbenchRecordCard>
          ) : null}

          {data.municipalDisclosures.map((disclosure) => (
            <WorkbenchRecordCard
              key={disclosure.id}
              title={`${disclosure.issuerName} disclosure`}
              subtitle={`${disclosure.disclosureType} | ${disclosure.status}`}
              summaryItems={[
                { label: 'Identifier', value: disclosure.identifierCode || 'Not assigned' },
                { label: 'EMMA', value: disclosure.emmaUrl || 'Not linked' },
                { label: 'Disclosure Date', value: disclosure.disclosureDate || 'Not tracked' },
                { label: 'Filed', value: disclosure.filingDate || 'Pending review' },
              ]}
              record={disclosure}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  municipalDisclosures: prev.municipalDisclosures.map((item) =>
                    item.id === disclosure.id ? nextRecord : item,
                  ),
                }))
              }
              actionSlot={
                disclosure.emmaUrl ? (
                  <a
                    href={disclosure.emmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Open EMMA
                  </a>
                ) : undefined
              }
            >
              {disclosure.notes ||
                'Use advanced edit to maintain filing posture, linked issuer documents, and municipal disclosure review notes.'}
            </WorkbenchRecordCard>
          ))}

          {data.municipalEventNotices.map((notice) => (
            <WorkbenchRecordCard
              key={notice.id}
              title={`${notice.issuerName} event notice`}
              subtitle={`${notice.eventType} | ${notice.severity} | ${notice.status}`}
              summaryItems={[
                { label: 'Identifier', value: notice.identifierCode || 'Not assigned' },
                { label: 'EMMA', value: notice.emmaUrl || 'Not linked' },
                { label: 'Event Date', value: notice.eventDate || 'Not tracked' },
                { label: 'Linked Docs', value: `${notice.linkedDocumentIds?.length || 0}` },
              ]}
              record={notice}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  municipalEventNotices: prev.municipalEventNotices.map((item) =>
                    item.id === notice.id ? nextRecord : item,
                  ),
                }))
              }
              actionSlot={
                notice.emmaUrl ? (
                  <a
                    href={notice.emmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Review Notice
                  </a>
                ) : undefined
              }
            >
              {notice.notes ||
                'Use advanced edit to keep event notices, severity posture, and supporting disclosure links current.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Security Source Search"
        description="Search reserve, municipal, brokerage, court-claim, and securitized-contract sources by identifier type before posting or linking a holding into the ledger."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {securityMerchantCatalog.map((source) => {
            const content = (
              <>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span>{source.label}</span>
                  <span style={{ color: 'var(--cf-muted)', fontSize: 12, lineHeight: 1.45 }}>
                    {source.supportedIdentifierTypes.join(', ')}
                  </span>
                  <span style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.45 }}>
                    {source.description}
                  </span>
                </div>
                <span style={{ color: 'var(--cf-muted)' }}>
                  {source.officialUrl ? 'Open' : source.searchPosture.replace(/_/g, ' ')}
                </span>
              </>
            );

            const sharedStyle = {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid rgba(126, 242, 255, 0.16)',
              background: 'rgba(10, 22, 35, 0.72)',
              color: '#e5e7eb',
              textDecoration: 'none',
              fontWeight: 700,
            } as const;

            return source.officialUrl ? (
              <a
                key={source.key}
                href={source.officialUrl}
                target="_blank"
                rel="noreferrer"
                style={sharedStyle}
              >
                {content}
              </a>
            ) : (
              <div key={source.key} style={sharedStyle}>
                {content}
              </div>
            );
          })}
        </div>
      </PageSection>

      <PageSection
        title="Traditional Assets"
        description="Property, receivables, reserve positions, and operating assets without raw record dumps."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.assets.map((asset) => (
            <WorkbenchRecordCard
              key={asset.id}
              title={asset.name}
              subtitle={`${asset.category} | ${asset.status}`}
              summaryItems={[
                {
                  label: 'Entity',
                  value:
                    data.entities.find((item) => item.id === asset.entityId)?.displayName ||
                    asset.entityId,
                },
                { label: 'Book Value', value: asset.bookValue.toLocaleString() },
                { label: 'Market Value', value: asset.marketValue?.toLocaleString() || 'Not tracked' },
                { label: 'Payment Medium', value: asset.paymentMedium || 'Not assigned' },
                {
                  label: 'Identifier / Liquidity',
                  value:
                    asset.identifierCode || asset.liquidityProfile
                      ? `${asset.identifierCode || 'No ID'} | ${asset.liquidityProfile || 'No liquidity review'}`
                      : 'General asset',
                },
              ]}
              record={asset}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  assets: prev.assets.map((item) => (item.id === asset.id ? nextRecord : item)),
                }))
              }
            >
              {asset.notes ||
                'Use advanced edit for linked ledgers, document support, and compliance tags.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Digital Assets"
        description="Wallet-held positions, payment tokens, tokenized instruments, and chain-linked holdings."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.digitalAssets.map((asset) => (
            <WorkbenchRecordCard
              key={asset.id}
              title={`${asset.name}${asset.symbol ? ` (${asset.symbol})` : ''}`}
              subtitle={`${asset.assetSubtype} | ${asset.network ?? 'Network not set'}`}
              summaryItems={[
                { label: 'Quantity', value: asset.quantity.toLocaleString() },
                { label: 'Estimated Value', value: asset.estimatedValue.toLocaleString() },
                { label: 'Classification', value: asset.classification },
                { label: 'Custody', value: `${asset.custodyStatus} / ${asset.complianceStatus}` },
                {
                  label: 'Execution',
                  value: asset.contractAddress
                    ? `${asset.symbol || asset.name} contract ready`
                    : 'Native or manual asset flow',
                },
              ]}
              record={asset}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  digitalAssets: prev.digitalAssets.map((item) =>
                    item.id === asset.id ? nextRecord : item
                  ),
                }))
              }
              actionSlot={
                asset.explorerUrl ? (
                  <a
                    href={asset.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(96,165,250,0.4)',
                      background: 'rgba(37,99,235,0.18)',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      textDecoration: 'none',
                    }}
                  >
                    Explorer
                  </a>
                ) : undefined
              }
            >
              {asset.linkedTokenIds?.length
                ? `Linked verification tokens: ${asset.linkedTokenIds.join(', ')}`
                : 'Use advanced edit for token references, linked documents, and ledger mapping.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Wallets"
        description="Connected custody records with treasury and ledger linkage."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.wallets.map((wallet) => (
            <WorkbenchRecordCard
              key={wallet.id}
              title={wallet.name}
              subtitle={`${wallet.network} | ${wallet.custodyType} | ${wallet.connectionStatus || 'connected'}`}
              summaryItems={[
                { label: 'Address', value: wallet.address },
                { label: 'Provider', value: wallet.connectionProvider || 'manual' },
                { label: 'Native Asset', value: wallet.nativeAssetSymbol || 'Not set' },
                { label: 'Last Sync', value: wallet.lastSyncAt?.slice(0, 10) || 'Not synced yet' },
              ]}
              record={wallet}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  wallets: prev.wallets.map((item) => (item.id === wallet.id ? nextRecord : item)),
                }))
              }
            >
              {wallet.linkedTreasuryAccountId || wallet.linkedLedgerAccountId
                ? `Linked treasury: ${wallet.linkedTreasuryAccountId || 'none'} | linked ledger: ${wallet.linkedLedgerAccountId || 'none'}`
                : 'Use advanced edit to attach this wallet to treasury or ledger execution.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>

      <PageSection
        title="Smart Contract Positions"
        description="Escrow, staking, vault, and tokenized instrument positions tied back to treasury controls."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {data.smartContractPositions.map((position) => (
            <WorkbenchRecordCard
              key={position.id}
              title={position.name}
              subtitle={`${position.network} | ${position.positionType} | ${position.status}`}
              summaryItems={[
                { label: 'Protocol', value: position.protocolName || 'Internal' },
                { label: 'Estimated Value', value: position.estimatedValue?.toLocaleString() || 'Not tracked' },
                { label: 'Wallet', value: position.walletId || 'No wallet linked' },
                { label: 'Contract', value: position.contractAddress || 'No address set' },
              ]}
              record={position}
              onSave={(nextRecord) =>
                setData((prev) => ({
                  ...prev,
                  smartContractPositions: prev.smartContractPositions.map((item) =>
                    item.id === position.id ? nextRecord : item
                  ),
                }))
              }
            >
              {position.linkedTokenIds?.length
                ? `Verification tokens linked: ${position.linkedTokenIds.join(', ')}`
                : 'Use advanced edit to attach control tokens and source documents.'}
            </WorkbenchRecordCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
