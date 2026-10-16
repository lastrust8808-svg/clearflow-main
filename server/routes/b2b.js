import express from 'express';
import { requireAccountAccess } from '../middleware/accountAuthorization.js';
import { recordsConfigured, readRecord } from '../services/durableAccountRecords.js';

const router = express.Router();
router.use('/:accountId', requireAccountAccess);
// Invoice creation is disabled until entity membership can be proven from
// server-controlled records. A caller-supplied ownerEntityId is not proof.
router.post('/:accountId/invoices', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Verified entity membership is required before invoice creation.',
  });
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
