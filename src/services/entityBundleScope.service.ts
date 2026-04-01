import type { CoreDataBundle } from '../types/core';

function filterArrayByEntityScope(items: unknown[], entityId: string): unknown[] {
  return items.filter((item) => {
    if (!item || typeof item !== 'object') {
      return true;
    }

    const record = item as Record<string, unknown>;

    if (typeof record.entityId === 'string') {
      return record.entityId === entityId;
    }

    if (typeof record.ownerEntityId === 'string') {
      return record.ownerEntityId === entityId;
    }

    if (typeof record.fromEntityId === 'string' || typeof record.toEntityId === 'string') {
      return record.fromEntityId === entityId || record.toEntityId === entityId;
    }

    if (typeof record.issuerEntityId === 'string' || typeof record.currentHolderEntityId === 'string') {
      return record.issuerEntityId === entityId || record.currentHolderEntityId === entityId;
    }

    if (typeof record.connectedEntityId === 'string') {
      return record.connectedEntityId === entityId;
    }

    return true;
  });
}

export function scopeBundleToEntity(bundle: CoreDataBundle, entityId: string): CoreDataBundle {
  const nextBundle = { ...bundle } as CoreDataBundle;
  const writableBundle = nextBundle as unknown as Record<string, unknown>;

  (Object.keys(bundle) as Array<keyof CoreDataBundle>).forEach((key) => {
    const value = bundle[key];
    if (!Array.isArray(value)) {
      return;
    }

    writableBundle[key as string] = filterArrayByEntityScope(
      value as unknown[],
      entityId,
    );
  });

  nextBundle.entities = bundle.entities.filter((entity) => entity.id === entityId);
  return nextBundle;
}
