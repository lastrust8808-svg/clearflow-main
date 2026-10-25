import {generateMonthlyMembershipCharge,pairedMembershipAccrual,authorizedAchCollection} from './membershipBillingEngine.js';
// db must be a pg Pool. Never run this from a public request without server-side authorization.
// The scheduler can run repeatedly: the invoice's unique month key prevents duplicate charges.
// Payment submission is deliberately NOT implemented: the provider mandate and settlement
// adapter must be verified before any money-moving operation is enabled.
export async function accrueMembershipMonth(db, subscription, {year,month,today}) {
  const invoice=generateMonthlyMembershipCharge({
    memberId:subscription.id,planId:subscription.plan_id,
    amountCents:Number(subscription.amount_cents),currency:subscription.currency,
    year,month,billingDay:Number(subscription.billing_day),status:subscription.status
  });
  if (!invoice || invoice.dueDate>today) return {created:false,reason:'not_due_or_inactive'};
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const lock=await client.query('SELECT id,status FROM membership_subscriptions WHERE id=$1 FOR UPDATE',[subscription.id]);
    if(lock.rowCount!==1 || lock.rows[0].status!=='active') {
      await client.query('ROLLBACK');return {created:false,reason:'inactive'};
    }
    const inserted=await client.query(
      `INSERT INTO membership_invoices(id,subscription_id,due_date,period_month,amount_cents,currency,status)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(subscription_id,period_month) DO NOTHING RETURNING id`,
      [invoice.id,subscription.id,invoice.dueDate,invoice.dueDate.slice(0,7),invoice.amountCents,invoice.currency,invoice.state]);
    if(!inserted.rowCount){await client.query('COMMIT');return {created:false,reason:'already_billed',invoiceId:invoice.id};}
    const postings=pairedMembershipAccrual(invoice,{memberEntityId:subscription.member_entity_id,clearflowEntityId:subscription.owner_entity_id});
    for(const p of postings) await client.query(
      `INSERT INTO membership_journal_entries(id,invoice_id,entity_id,account,debit_cents,credit_cents)
       VALUES($1,$2,$3,$4,$5,$6)`,[p.id,p.invoiceId,p.entityId,p.account,p.debitCents,p.creditCents]);
    await client.query('COMMIT');
    // The scheduler must never claim collection. No ACH payment is submitted here.
    return {created:true,invoiceId:invoice.id,amountCents:invoice.amountCents,
      collection:authorizedAchCollection(invoice,{
        enabled:!!subscription.ach_authorized_at,
        memberId:subscription.id,currency:subscription.currency,
        maxAmountCents:Number(subscription.ach_max_amount_cents||0),
        mandateReference:subscription.ach_mandate_reference,
        providerPaymentMethodRef:subscription.ach_payment_method_ref,
        acceptedAt:subscription.ach_authorized_at,
        revokedAt:subscription.ach_revoked_at,
        authorizationVersion:subscription.ach_authorized_at?'v1':null
      },today)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function runMembershipAccrual(db,today) {
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(today) || !Number.isFinite(Date.parse(today+'T00:00:00Z')))throw new Error('Invalid UTC billing date');
  const [year,month]=today.split('-').map(Number);
  const subscriptions=await db.query(
    `SELECT * FROM membership_subscriptions WHERE status='active' AND
      (next_due_date IS NULL OR next_due_date <= $1::date) ORDER BY id`,[today]);
  const results=[];
  for(const sub of subscriptions.rows) results.push(await accrueMembershipMonth(db,sub,{year,month,today}));
  return results;
}
