import test from 'node:test';
import assert from 'node:assert/strict';
import {billingDateForMonth,generateMonthlyMembershipCharge,pairedMembershipAccrual,authorizedAchCollection,paymentSettlementPostings} from './membershipBillingEngine.js';
test('end-of-month billing rolls to last valid date',()=>{
  assert.equal(billingDateForMonth(2027,2,31),'2027-02-28');
  assert.equal(billingDateForMonth(2028,2,31),'2028-02-29');
});
test('invoice has stable month identity and balanced mirrored entries',()=>{
  const invoice=generateMonthlyMembershipCharge({memberId:'m1',planId:'starter',amountCents:3300,year:2026,month:10,billingDay:25});
  assert.equal(invoice.dueDate,'2026-10-25');
  assert.equal(invoice.id,generateMonthlyMembershipCharge({memberId:'m1',planId:'starter',amountCents:3300,year:2026,month:10,billingDay:25}).id);
  const entries=pairedMembershipAccrual(invoice,{memberEntityId:'member',clearflowEntityId:'owner'});
  assert.equal(entries.length,4);
  for(const entity of ['member','owner']) assert.equal(entries.filter(e=>e.entityId===entity).reduce((a,e)=>a+e.debitCents-e.creditCents,0),0);
});
test('inactive membership and full credit cannot be charged',()=>{
  assert.equal(generateMonthlyMembershipCharge({memberId:'m',planId:'p',amountCents:3300,year:2026,month:10,billingDay:1,status:'cancelled'}),null);
  assert.equal(generateMonthlyMembershipCharge({memberId:'m',planId:'p',amountCents:3300,creditCents:3300,year:2026,month:10,billingDay:1}).state,'covered_by_credit');
});
test('ACH requires an unrevoked mandate and exact due date',()=>{
  const invoice=generateMonthlyMembershipCharge({memberId:'m1',planId:'p',amountCents:3300,year:2026,month:10,billingDay:25});
  const mandate={enabled:true,memberId:'m1',currency:'USD',maxAmountCents:3300,mandateReference:'mandate',providerPaymentMethodRef:'pm',acceptedAt:'2026-10-01',authorizationVersion:'v1'};
  assert.equal(authorizedAchCollection(invoice,mandate,'2026-10-24').eligible,false);
  assert.equal(authorizedAchCollection(invoice,{...mandate,revokedAt:'2026-10-20'},'2026-10-25').eligible,false);
  assert.equal(authorizedAchCollection(invoice,mandate,'2026-10-25').state,'awaiting_provider_adapter');
});
test('settlement entries reject unverified events',()=>{
  const invoice=generateMonthlyMembershipCharge({memberId:'m1',planId:'p',amountCents:3300,year:2026,month:10,billingDay:25});
  assert.throws(()=>paymentSettlementPostings(invoice,{status:'settled'}, {memberEntityId:'m',clearflowEntityId:'o'}));
  const entries=paymentSettlementPostings(invoice,{verified:true,invoiceId:invoice.id,amountCents:3300,currency:'USD',providerTransactionId:'tx1',status:'settled'},{memberEntityId:'m',clearflowEntityId:'o'});
  assert.equal(entries.length,4);
});
