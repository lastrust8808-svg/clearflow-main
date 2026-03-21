import express from 'express';
import {
  loadAccountAppData,
  loadAccountDocumentFile,
  saveAccountAppData,
  saveAccountDocumentFile,
} from '../services/accountStorage.js';

const router = express.Router();

router.get('/accounts/:accountId/app-data', async (req, res) => {
  try {
    const appData = await loadAccountAppData(req.params.accountId);

    if (!appData) {
      return res.status(404).json({ success: false, error: 'Account data not found.' });
    }

    return res.status(200).json({ success: true, appData });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load account data.',
    });
  }
});

router.put('/accounts/:accountId/app-data', async (req, res) => {
  if (!req.body?.user?.id) {
    return res.status(400).json({ success: false, error: 'Missing app data payload.' });
  }

  try {
    const result = await saveAccountAppData(req.params.accountId, req.body);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save account data.',
    });
  }
});

router.get('/accounts/:accountId/files/:fileId', async (req, res) => {
  try {
    const fileRecord = await loadAccountDocumentFile(req.params.accountId, req.params.fileId);

    if (!fileRecord) {
      return res.status(404).json({ success: false, error: 'Document file not found.' });
    }

    return res.status(200).json({ success: true, file: fileRecord });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load document file.',
    });
  }
});

router.post('/accounts/:accountId/files', async (req, res) => {
  const { fileId, fileName, mimeType, sizeBytes, uploadedAt, base64Data } = req.body || {};

  if (!fileId || !fileName || !base64Data) {
    return res.status(400).json({ success: false, error: 'Missing document file payload.' });
  }

  try {
    const result = await saveAccountDocumentFile(req.params.accountId, fileId, {
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: Number(sizeBytes || 0),
      uploadedAt: uploadedAt || new Date().toISOString(),
      base64Data,
    });

    return res.status(201).json({ success: true, result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save document file.',
    });
  }
});

export default router;
