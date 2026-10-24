import { randomUUID } from 'node:crypto';

export function stagePlaidDelivery(item) {
  if (item.delivery) return { delivery: item.delivery, changed: false };
  const added = item.pendingAddedTransactions || [];
  const modified = item.pendingModifiedTransactions || [];
  const removedTransactionIds = item.removedTransactionIds || [];
  if (!added.length && !modified.length && !removedTransactionIds.length) {
    return { delivery: { added: [], modified: [], removedTransactionIds: [] }, changed: false };
  }
  item.delivery = { itemId: item.itemId, deliveryId: randomUUID(), added, modified, removedTransactionIds };
  item.pendingAddedTransactions = [];
  item.pendingModifiedTransactions = [];
  item.removedTransactionIds = [];
  return { delivery: item.delivery, changed: true };
}

export function acknowledgePlaidDelivery(item, deliveryId, appData) {
  if (item.lastAcknowledgedDeliveryId === deliveryId) return false;
  if (item.delivery?.deliveryId !== deliveryId) {
    throw Object.assign(new Error('Bank delivery is no longer current. Reload before acknowledging.'), { statusCode: 409 });
  }
  const retained = appData?.coreDataSnapshot?.bankFeedDeliveryReceipts?.some(receipt =>
    receipt.itemId === item.itemId && receipt.deliveryId === deliveryId);
  if (!retained) {
    throw Object.assign(new Error('Save the imported workspace before acknowledging this bank delivery.'), { statusCode: 409 });
  }
  item.lastAcknowledgedDeliveryId = deliveryId;
  item.delivery = null;
  // Changes arriving after this delivery was staged remain in the pending arrays.
  return true;
}
