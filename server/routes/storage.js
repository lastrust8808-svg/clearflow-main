import express from 'express';
import {
  loadAccountAppData,
  loadAccountDocumentFile,
  loadAccountRemittanceVault,
  saveAccountAppData,
  saveAccountDocumentFile,
  saveAccountRemittanceVault,
} from '../services/accountStorage.js';
import { decryptJson, encryptJson } from '../utils/secureVault.js';

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

router.get('/accounts/:accountId/vendors/:vendorId/remittance-instructions', async (req, res) => {
  try {
    const record = await loadAccountRemittanceVault(req.params.accountId, req.params.vendorId);

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Remittance instructions not found.',
      });
    }

    const instructions = decryptJson(record.encryptedPayload);
    return res.status(200).json({
      success: true,
      instructions,
      savedAt: record.savedAt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to load remittance instructions.',
    });
  }
});

router.put('/accounts/:accountId/vendors/:vendorId/remittance-instructions', async (req, res) => {
  const {
    beneficiaryName,
    bankName,
    routingNumber,
    accountNumber,
    accountType,
    railPreference,
    remittanceEmail,
  } = req.body || {};

  if (!beneficiaryName || !routingNumber || !accountNumber) {
    return res.status(400).json({
      success: false,
      error: 'Missing remittance instruction payload.',
    });
  }

  try {
    const encryptedPayload = encryptJson({
      beneficiaryName,
      bankName,
      routingNumber,
      accountNumber,
      accountType,
      railPreference,
      remittanceEmail,
    });

    const result = await saveAccountRemittanceVault(
      req.params.accountId,
      req.params.vendorId,
      {
        encryptedPayload,
      }
    );

    return res.status(200).json({
      success: true,
      result,
      masked: {
        beneficiaryName,
        bankName,
        accountMask: String(accountNumber).slice(-4),
        routingMask: String(routingNumber).slice(-4),
        accountType,
        railPreference,
        remittanceEmail,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to save remittance instructions.',
    });
  }
});

export default router;
