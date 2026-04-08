import type { CoreDataBundle, EntityRecord } from '../types/core';

export interface TrustFundingView {
  entity: EntityRecord;
  liquidFunding: number;
  reserveFunding: number;
  titledAssetValue: number;
  incomeBearingValue: number;
  governingDocumentCount: number;
  trustDocumentCount: number;
  readiness: 'underfunded' | 'watch' | 'funded';
  summary: string;
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function buildTrustFundingViews(data: CoreDataBundle): TrustFundingView[] {
  return data.entities
    .filter((entity) => entity.type === 'trust')
    .map((entity) => {
      const liquidFunding = data.bankAccounts
        .filter((account) => account.entityId === entity.id && account.status === 'active')
        .reduce((sum, account) => sum + (account.currentBalance || 0), 0);
      const reserveFunding = data.treasuryAccounts
        .filter((account) => account.entityId === entity.id)
        .reduce((sum, account) => sum + (account.availableBalance || 0) + (account.reservedBalance || 0), 0);
      const titledAssetValue = data.assets
        .filter((asset) => asset.entityId === entity.id && asset.status !== 'archived')
        .reduce((sum, asset) => sum + (asset.marketValue || asset.bookValue || 0), 0);
      const incomeBearingValue =
        data.instruments
          .filter(
            (instrument) =>
              instrument.entityId === entity.id &&
              (instrument.sourceClass === 'bond' ||
                instrument.instrumentType === 'private_bond' ||
                typeof instrument.couponRate === 'number'),
          )
          .reduce(
            (sum, instrument) => sum + (instrument.denominationValue || 0),
            0,
          ) +
        data.assets
          .filter(
            (asset) =>
              asset.entityId === entity.id &&
              (asset.category === 'security' || typeof asset.couponRate === 'number'),
          )
          .reduce((sum, asset) => sum + (asset.marketValue || asset.bookValue || 0), 0);
      const governingDocumentCount = data.documents.filter(
        (document) =>
          document.entityId === entity.id &&
          ['governing', 'authority_record', 'contract'].includes(document.category),
      ).length;
      const trustDocumentCount = data.documents.filter((document) => document.entityId === entity.id).length;
      const totalFunding = liquidFunding + reserveFunding + titledAssetValue;
      const readiness =
        totalFunding <= 0 || governingDocumentCount === 0
          ? 'underfunded'
          : liquidFunding <= 0
            ? 'watch'
            : 'funded';
      const summary =
        readiness === 'funded'
          ? `${entity.displayName || entity.name} shows liquid funding of ${formatMoney(liquidFunding)}, reserve support of ${formatMoney(reserveFunding)}, and titled asset support of ${formatMoney(titledAssetValue)} with ${governingDocumentCount} governing or authority records available for accounting interpretation.`
          : readiness === 'watch'
            ? `${entity.displayName || entity.name} has titled or reserve support, but lacks enough liquid operating cash for clean trust administration. Uploaded terms should be reviewed before treating projected trust rights as operational cash.`
            : `${entity.displayName || entity.name} does not yet show enough funding or governing support to treat the trust as operationally funded. Upload the trust agreement, funding schedule, and initial transfer support before relying on trust accounting outputs.`;

      return {
        entity,
        liquidFunding,
        reserveFunding,
        titledAssetValue,
        incomeBearingValue,
        governingDocumentCount,
        trustDocumentCount,
        readiness,
        summary,
      };
    });
}
