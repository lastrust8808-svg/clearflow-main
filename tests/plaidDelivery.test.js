import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePlaidDelivery,acknowledgePlaidDelivery } from '../server/services/plaidDelivery.js';
const fixture=()=>({itemId:'item',pendingAddedTransactions:[{transaction_id:'first'}],pendingModifiedTransactions:[],removedTransactionIds:[]});
const receipt=(itemId,deliveryId)=>({coreDataSnapshot:{bankFeedDeliveryReceipts:[{itemId,deliveryId}]}});
test('a staged delivery survives serialization and is replayed unchanged',()=>{
 const item=fixture(),first=stagePlaidDelivery(item).delivery;
 const restored=JSON.parse(JSON.stringify(item));
 assert.deepEqual(stagePlaidDelivery(restored).delivery,first);
 assert.deepEqual(first.added,[{transaction_id:'first'}]);
});
test('acknowledgement requires the matching receipt in the retained workspace',()=>{
 const item=fixture(),delivery=stagePlaidDelivery(item).delivery;
 for(const workspace of [null,receipt('foreign',delivery.deliveryId),receipt('item','stale')])assert.throws(()=>acknowledgePlaidDelivery(item,delivery.deliveryId,workspace),/Save the imported workspace/);
 assert.equal(item.delivery.deliveryId,delivery.deliveryId);
});
test('acknowledgement preserves later changes and is safe to retry',()=>{
 const item=fixture(),first=stagePlaidDelivery(item).delivery;
 item.pendingAddedTransactions=[{transaction_id:'later'}];
 assert.equal(acknowledgePlaidDelivery(item,first.deliveryId,receipt('item',first.deliveryId)),true);
 const second=stagePlaidDelivery(item).delivery;
 assert.deepEqual(second.added,[{transaction_id:'later'}]);
 assert.equal(acknowledgePlaidDelivery(item,first.deliveryId,{}),false);
 assert.equal(item.delivery.deliveryId,second.deliveryId);
 assert.throws(()=>acknowledgePlaidDelivery(item,'unknown',{}),/no longer current/);
});
