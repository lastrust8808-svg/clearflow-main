import express from 'express';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
]);

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://clearflow.site',
  'https://www.clearflow.site',
  'https://clearflow-site.vercel.app',
]);

function getAllowedOrigins() {
  const configured = (
    process.env.GEMINI_ALLOWED_ORIGINS ||
    process.env.GOOGLE_ALLOWED_ORIGINS ||
    ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(
    configured.length > 0 ? configured : Array.from(DEFAULT_ALLOWED_ORIGINS)
  );
}

function validateBrowserRequest(req, res) {
  const requestMarker = req.get('X-Requested-With');
  const requestOrigin = req.get('origin');

  if (requestMarker !== 'XMLHttpRequest') {
    res.status(400).json({
      success: false,
      error: 'Gemini requests require a verified browser request.',
    });
    return false;
  }

  if (!requestOrigin || !getAllowedOrigins().has(requestOrigin)) {
    res.status(403).json({
      success: false,
      error: 'This ClearFlow origin is not allowed to use Gemini services.',
    });
    return false;
  }

  return true;
}

router.get('/status', (req, res) => {
  return res.status(200).json({
    success: true,
    configured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
  });
});

router.post('/generate', async (req, res) => {
  if (!validateBrowserRequest(req, res)) {
    return;
  }

  const { model, contents, config } = req.body || {};

  if (!model || !ALLOWED_MODELS.has(model)) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported Gemini model.',
    });
  }

  if (contents === undefined || contents === null) {
    return res.status(400).json({
      success: false,
      error: 'Missing Gemini request contents.',
    });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'Gemini API is not configured on the ClearFlow server.',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents,
      ...(config ? { config } : {}),
    });

    return res.status(200).json({
      success: true,
      text: response.text ?? null,
    });
  } catch (error) {
    console.error('Gemini generation failed.', error);
    return res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : 'Gemini request failed.',
    });
  }
});

export default router;
