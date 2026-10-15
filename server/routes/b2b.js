import express from 'express';
import { requireAccountAccess } from '../middleware/accountAuthorization.js';
import { recordsConfigured, readRecord, createRecordOnce } from '../services/durableAccountRecords.js';
import { validateB2BInvoice } from '../services/b2bPayments.js';

const router = express.Router();
router.use('/:accountId', requireAccountAccess);
router.post('/:accountId/invoices', async (req, res) => {
  if (!recordsConfigured()) return res.status(503).json({ success: false, error: 'Durable database unavailable.' });
  try {
    const invoice = validateB2BInvoice(req.body);
    const ownerEntityId = String(req.body?.ownerEntityId || '');
    // This API intentionally permits only the payer's own account to store a draft.
    // Entity membership and external recipient delivery are not yet verified.
    if (ownerEntityId !== invoice.payerEntityId) return res.status(403).json({ success: false, error: 'Entity ownership verification required.' });
    // An account-scoped draft is NOT a payable obligation or bank payment authorization.
    const record = { ...invoice, accountId: req.params.accountId, state: 'draft_unverified', createdAt: new Date().toISOString(), settlementConfirmed: false };
    const created = await createRecordOnce(req.params.accountId, 'b2b_invoice_draft', invoice.id, record);
    if (!created) return res.status(409).json({ success: false, error: 'Invoice identifier already exists.' });
    return res.status(201).json({ success: true, invoice: record });
  } catch (error) {
    return res.status(error.statusCode || 503).json({ success: false, error: error.message || 'Invoice draft unavailable.' });
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
export default router;
