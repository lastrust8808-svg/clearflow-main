import type { EntityRecord } from '../types/core';

export interface EntityWorkspaceView {
  entityId: string;
  entityLabel: string;
  primaryEmail?: string;
  storageEmail?: string;
  storageMode: 'operator_google' | 'entity_google' | 'internal_only';
  storageModeLabel: string;
  sessionStatus: 'ready' | 'needs_switch' | 'not_connected' | 'internal_only';
  sessionStatusLabel: string;
  shareInCollectiveOverview: boolean;
  shareInOperatorDashboard: boolean;
  isActiveStorageIdentity: boolean;
}

function formatModeLabel(mode: EntityWorkspaceView['storageMode']) {
  switch (mode) {
    case 'operator_google':
      return 'Operator Google Drive';
    case 'entity_google':
      return 'Entity Google Drive';
    default:
      return 'Internal only';
  }
}

export function buildEntityWorkspaceView(input: {
  entity: EntityRecord;
  currentGoogleEmail?: string | null;
  hasDriveAccess?: boolean;
}): EntityWorkspaceView {
  const { entity, currentGoogleEmail, hasDriveAccess = false } = input;
  const storageMode = entity.entityAccess?.storageMode ?? 'operator_google';
  const storageEmail = entity.entityAccess?.googleStorageEmail || entity.primaryEmail;
  const currentEmail = (currentGoogleEmail || '').trim().toLowerCase();
  const targetEmail = (storageEmail || '').trim().toLowerCase();
  const isActiveStorageIdentity = Boolean(currentEmail && targetEmail && currentEmail === targetEmail);

  let sessionStatus: EntityWorkspaceView['sessionStatus'];
  if (storageMode === 'internal_only') {
    sessionStatus = 'internal_only';
  } else if (!hasDriveAccess) {
    sessionStatus = 'not_connected';
  } else if (storageMode === 'entity_google' && targetEmail && !isActiveStorageIdentity) {
    sessionStatus = 'needs_switch';
  } else {
    sessionStatus = 'ready';
  }

  const sessionStatusLabel =
    sessionStatus === 'ready'
      ? 'Drive ready for this board'
      : sessionStatus === 'needs_switch'
        ? `Reconnect Google as ${storageEmail || 'the entity storage account'}`
        : sessionStatus === 'not_connected'
          ? 'Drive not connected yet'
          : 'Internal retained or local-only posture';

  return {
    entityId: entity.id,
    entityLabel: entity.displayName || entity.name,
    primaryEmail: entity.primaryEmail,
    storageEmail,
    storageMode,
    storageModeLabel: formatModeLabel(storageMode),
    sessionStatus,
    sessionStatusLabel,
    shareInCollectiveOverview: entity.entityAccess?.shareInCollectiveOverview ?? true,
    shareInOperatorDashboard: entity.entityAccess?.shareInOperatorDashboard ?? true,
    isActiveStorageIdentity,
  };
}

export function buildEntityWorkspaceViews(input: {
  entities: EntityRecord[];
  currentGoogleEmail?: string | null;
  hasDriveAccess?: boolean;
}) {
  return input.entities.map((entity) =>
    buildEntityWorkspaceView({
      entity,
      currentGoogleEmail: input.currentGoogleEmail,
      hasDriveAccess: input.hasDriveAccess,
    }),
  );
}
