import express from 'express';
import { validateCreditMemo } from '../services/b2bCreditMemos.js';
import { hasEntityPermission } from '../services/b2bMembership.js';
import { validateB2BInvoice } from '../services/b2bPayments.js';
import { requireAccountAccess } from '../middleware/accountAuthorization.js';
import { recordsConfigured, readRecord, createRecordOnce } from '../services/durableAccountRecords.js';

const router = express.Router();
router.use('/:accountId', requireAccountAccess);
// An authenticated account must hold a server-provisioned, unrevoked entity grant.
router.post('/:accountId/invoices', async (req, res) => {
  if (!recordsConfigured()) return res.status(503).json({ success: false, error: 'Durable database unavailable.' });
  try {
    const invoice = validateB2BInvoice(req.body);
    if (!await hasEntityPermission(req.params.accountId, invoice.payeeEntityId, 'invoice_create')) {
      return res.status(403).json({ success: false, error: 'Verified entity membership is required before invoice creation.' });
    }
    const record = { ...invoice, accountId: req.params.accountId, state: 'draft', createdAt: new Date().toISOString(), settlementConfirmed: false };
    if (!await createRecordOnce(req.params.accountId, 'b2b_invoice_draft', invoice.id, record)) {
      return res.status(409).json({ success: false, error: 'Invoice identifier already exists.' });
    }
    return res.status(201).json({ success: true, invoice: record });
  } catch (error) {
    return res.status(error.statusCode === 400 ? 400 : 503).json({ success: false, error: error.statusCode === 400 ? error.message : 'Invoice creation unavailable.' });
  }
});
router.get('/:accountId/invoices/:invoiceId', async (req, res) => {
  if (!recordsConfigured()) return res.status(503).json({ success: false, error: 'Durable database unavailable.' });
  try {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(req.params.invoiceId)) return res.status(400).json({ success: false, error: 'Invalid invoice identifier.' });
    const invoice = await readRecord(req.params.accountId, 'b2b_invoice_draft', req.params.invoiceId);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice draft not found.' });
    return res.status(200).json({ success: true, invoice });
  } catch {
    return res.status(503).json({ success: false, error: 'Invoice draft unavailable.' });
  }
});

const ID = /^[A-Za-z0-9_-]{1,120}$/;
// Disputes are immutable, account-scoped records. They never change payment state.
router.post('/:accountId/invoices/:invoiceId/disputes', async (req, res) => {
  if (!recordsConfigured()) return res.status(503).json({ success: false, error: 'Durable database unavailable.' });
  const { accountId, invoiceId } = req.params;
  const { disputeId, reason } = req.body || {};
  if (!ID.test(invoiceId) || typeof disputeId !== 'string' || !ID.test(disputeId) ||
      typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 2000) {
    return res.status(400).json({ success: false, error: 'Valid dispute identifier and reason required.' });
  }
  try {
    const invoice = await readRecord(accountId, 'b2b_invoice_draft', invoiceId);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
    if (!await hasEntityPermission(accountId, invoice.payerEntityId, 'payment_approve')) {
      return res.status(403).json({ success: false, error: 'Verified payer entity permission required.' });
    }
    const dispute = { id: disputeId, invoiceId, payerEntityId: invoice.payerEntityId,
      reason: reason.trim(), state: 'open', createdAt: new Date().toISOString() };
    const created = await createRecordOnce(accountId, 'b2b_invoice_dispute', disputeId, dispute);
    if (!created) return res.status(409).json({ success: false, error: 'Dispute identifier already exists.' });
    return res.status(201).json({ success: true, dispute });
  } catch {
    return res.status(503).json({ success: false, error: 'Dispute unavailable.' });
  }
});


/**
 * Payer acceptance is a durable acknowledgment, NOT authorization to debit a bank.
 * It requires a separately provisioned payer permission on the authenticated account.
 */
router.post('/:accountId/invoices/:invoiceId/acceptances', async (req, res) => {
  if (!recordsConfigured()) return res.status(503).json({ success: false, error: 'Durable database unavailable.' });
  const { accountId, invoiceId } = req.params;
  if (!ID.test(invoiceId) || req.body?.accepted !== true) {
    return res.status(400).json({ success: false, error: 'Explicit invoice acceptance is required.' });
  }
  try {
    const invoice = await readRecord(accountId, 'b2b_invoice_draft', invoiceId);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
    if (!await hasEntityPermission(accountId, invoice.payerEntityId, 'payment_approve')) {
      return res.status(403).json({ success: false, error: 'Verified payer entity permission required.' });
    }
    const acceptance = { invoiceId, payerEntityId: invoice.payerEntityId,
      amountCents: invoice.amountCents, currency: invoice.currency,
      state: 'accepted_not_paid', acceptedAt: new Date().toISOString() };
    if (!await createRecordOnce(accountId, 'b2b_invoice_acceptance', invoiceId, acceptance)) {
      return res.status(409).json({ success: false, error: 'Invoice already accepted.' });
    }
    return res.status(201).json({ success: true, acceptance });
  } catch {
    return res.status(503).json({ success: false, error: 'Invoice acceptance unavailable.' });
  }
});


router.post('/:accountId/invoices/:invoiceId/credit-memos', async (req, res) => {
  if (!recordsConfigured()) return res.status(503).json({ success: false, error: 'Durable database unavailable.' });
  const { accountId, invoiceId } = req.params;
  if (!ID.test(invoiceId)) return res.status(400).json({ success: false, error: 'Invalid invoice identifier.' });
  try {
    const invoice = await readRecord(accountId, 'b2b_invoice_draft', invoiceId);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
    if (!await hasEntityPermission(accountId, invoice.payeeEntityId, 'invoice_create')) {
      return res.status(403).json({ success: false, error: 'Verified issuer permission required.' });
    }
    let memo;
    try { memo = validateCreditMemo(invoice, req.body); }
    catch (error) { return res.status(400).json({ success: false, error: error.message }); }
    // One credit memo per invoice until aggregate credit accounting is implemented.
    // Keyed by invoice ID to prevent multiple credits from exceeding the invoice.
    const created = await createRecordOnce(accountId, 'b2b_invoice_credit_memo', invoiceId,
      { ...memo, createdAt: new Date().toISOString() });
    if (!created) return res.status(409).json({ success: false, error: 'Invoice already has a credit memo.' });
    return res.status(201).json({ success: true, creditMemo: memo });
  } catch {
    return res.status(503).json({ success: false, error: 'Credit memo unavailable.' });
  }
});

export default router;
