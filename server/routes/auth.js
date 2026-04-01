import express from 'express';
import { isMailerConfigured, sendPlainEmail } from '../utils/mailer.js';
import { isSmsConfigured, sendVerificationSms } from '../utils/messenger.js';

const router = express.Router();

const DEFAULT_ALLOWED_GOOGLE_ORIGINS = new Set([
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://clearflow.site',
  'https://www.clearflow.site',
  'https://clearflow-site.vercel.app',
]);

function getAllowedGoogleOrigins() {
  const configured = (process.env.GOOGLE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(
    configured.length > 0 ? configured : Array.from(DEFAULT_ALLOWED_GOOGLE_ORIGINS)
  );
}

async function fetchGoogleUserProfile(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to load Google profile after authorization.');
  }

  return response.json();
}

router.post('/verification/start', async (req, res) => {
  const { contactType, contactValue, maskedTarget, code } = req.body || {};

  if (!contactType || !contactValue || !maskedTarget || !code) {
    return res.status(400).json({
      success: false,
      error: 'Missing verification delivery payload.',
    });
  }

  if (contactType === 'phone') {
    if (!isSmsConfigured()) {
      return res.status(200).json({
        success: true,
        deliveryMode: 'in_app_preview',
        maskedTarget,
        message: 'SMS delivery is not configured yet, so the verification code is staying in preview mode.',
      });
    }

    try {
      await sendVerificationSms({
        to: contactValue,
        body: `Your ClearFlow verification code is ${code}. This code expires in 10 minutes.`,
      });

      return res.status(200).json({
        success: true,
        deliveryMode: 'sms_sent',
        maskedTarget,
        message: `Verification code sent by text to ${maskedTarget}.`,
      });
    } catch (error) {
      return res.status(200).json({
        success: true,
        deliveryMode: 'in_app_preview',
        maskedTarget,
        message:
          error instanceof Error
            ? `SMS delivery failed, so the code is available in preview mode. ${error.message}`
            : 'SMS delivery failed, so the code is available in preview mode.',
      });
    }
  }

  if (!isMailerConfigured()) {
    return res.status(200).json({
      success: true,
      deliveryMode: 'in_app_preview',
      maskedTarget,
      message: 'SMTP is not configured, so the verification code is staying in preview mode.',
    });
  }

  try {
    await sendPlainEmail({
      to: contactValue,
      subject: 'Your ClearFlow verification code',
      text: `Your ClearFlow verification code is ${code}. This code expires in 10 minutes.`,
      html: `<p>Your ClearFlow verification code is <strong style="font-size:18px;">${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      fromName: 'ClearFlow Access',
    });

    return res.status(200).json({
      success: true,
      deliveryMode: 'email_sent',
      maskedTarget,
      message: `Verification code sent to ${maskedTarget}.`,
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      deliveryMode: 'in_app_preview',
      maskedTarget,
      message:
        error instanceof Error
          ? `Email delivery failed, so the code is available in preview mode. ${error.message}`
          : 'Email delivery failed, so the code is available in preview mode.',
    });
  }
});

router.get('/status', async (req, res) => {
  return res.status(200).json({
    success: true,
    status: {
      smtpConfigured: isMailerConfigured(),
      smsConfigured: isSmsConfigured(),
      smsProvider: process.env.SMS_PROVIDER || null,
      plaidConfigured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    },
  });
});

router.post('/google/exchange', async (req, res) => {
  const { code, redirectUri } = req.body || {};
  const requestMarker = req.get('X-Requested-With');
  const requestOrigin = req.get('origin');
  const allowedOrigins = getAllowedGoogleOrigins();
  const googleClientId =
    process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (requestMarker !== 'XMLHttpRequest') {
    return res.status(400).json({
      success: false,
      error: 'Google authorization exchange requires a verified browser request.',
    });
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing Google authorization code.',
    });
  }

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    return res.status(403).json({
      success: false,
      error: 'This Google authorization origin is not allowed.',
    });
  }

  if (!googleClientId || !googleClientSecret) {
    return res.status(500).json({
      success: false,
      error: 'Google OAuth server credentials are not configured yet.',
    });
  }

  try {
    const tokenPayload = new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri:
        typeof redirectUri === 'string' && redirectUri.trim()
          ? redirectUri.trim()
          : requestOrigin,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenPayload.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(400).json({
        success: false,
        error:
          tokenData?.error_description ||
          tokenData?.error ||
          'Google authorization exchange failed.',
      });
    }

    const profile = await fetchGoogleUserProfile(tokenData.access_token);

    return res.status(200).json({
      success: true,
      auth: {
        accessToken: tokenData.access_token,
        expiresIn: tokenData.expires_in ?? null,
        scope: tokenData.scope ?? null,
        tokenType: tokenData.token_type ?? 'Bearer',
      },
      profile: {
        email: profile.email || '',
        name: profile.name || profile.email || '',
        picture: profile.picture || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Google authorization exchange could not be completed.',
    });
  }
});

export default router;
