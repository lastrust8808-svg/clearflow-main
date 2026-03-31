import type {
  EntityMarkRailCode,
  EntityMarkUsageRecord,
  EntityRecord,
  TaxReportingLinkRecord,
  WorkspaceSettingsRecord,
} from '../types/core';

export interface EntityMarkRailView {
  usageId: string;
  entityId: string;
  documentId: string;
  markLabel: string;
  currency: string;
  totalValue: number;
  appliedRails: EntityMarkRailCode[];
  liquidationFocus: EntityMarkUsageRecord['liquidationFocus'];
  railStatus: 'ready' | 'watch';
  watchReasons: string[];
}

export function buildEntityMarkRailViews(input: {
  entities: EntityRecord[];
  entityMarkUsageRecords: EntityMarkUsageRecord[];
  taxReportingLinks: TaxReportingLinkRecord[];
  workspaceSettings: WorkspaceSettingsRecord;
}): EntityMarkRailView[] {
  return input.entityMarkUsageRecords.map((usage) => {
    const entity = input.entities.find((item) => item.id === usage.entityId);
    const watchReasons: string[] = [];

    if (!usage.appliedRails?.includes('mailing_proof')) {
      watchReasons.push('Mailing proof identity is not fully configured.');
    }
    if (!usage.appliedRails?.includes('cash_settlement')) {
      watchReasons.push('No direct cash settlement path is linked yet.');
    }
    if (
      usage.appliedRails?.includes('tax_evidence') &&
      !input.workspaceSettings.eftpsEnabled &&
      !input.taxReportingLinks.some((item) => item.entityId === usage.entityId)
    ) {
      watchReasons.push('Tax evidence rail is implied, but EFTPS or tax filing links are still light.');
    }
    if (!usage.digitalAssetId && usage.liquidationFocus === 'digital_asset_to_cash') {
      watchReasons.push('Digital liquidation was expected, but no linked mark reserve unit was found.');
    }
    if (!entity?.branding?.sealValueEnabled) {
      watchReasons.push('Seal value reserve is not enabled on the entity profile.');
    }

    return {
      usageId: usage.id,
      entityId: usage.entityId,
      documentId: usage.documentId,
      markLabel: usage.markLabel,
      currency: usage.currency,
      totalValue: usage.totalValue,
      appliedRails: usage.appliedRails || ['mark_reserve'],
      liquidationFocus: usage.liquidationFocus || 'none',
      railStatus: watchReasons.length ? 'watch' : 'ready',
      watchReasons,
    };
  });
}
