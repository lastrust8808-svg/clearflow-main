import express from 'express';

const router = express.Router();

router.use((_req, res) => {
  res.status(501).json({
    success: false,
    error:
      'Plaid runtime routes are not enabled in the current local server bundle yet. ERP operations endpoints remain available under /api/erp.',
  });
});

export default router;
