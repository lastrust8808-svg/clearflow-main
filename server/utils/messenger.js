import fetch from 'node-fetch';

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase();
}

export function isSmsConfigured() {
  const provider = normalizeProvider(process.env.SMS_PROVIDER);

  if (provider === 'twilio') {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
    );
  }

  return false;
}

export async function sendVerificationSms({ to, body }) {
  const provider = normalizeProvider(process.env.SMS_PROVIDER);

  if (provider !== 'twilio') {
    throw new Error('A supported SMS provider is not configured.');
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio SMS credentials are incomplete.');
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: body,
      }).toString(),
    }
  );

  if (!response.ok) {
    let message = 'SMS delivery failed.';

    try {
      const errorPayload = await response.json();
      if (errorPayload?.message) {
        message = `SMS delivery failed. ${errorPayload.message}`;
      }
    } catch {
      // Ignore JSON parsing failures and keep the generic message.
    }

    throw new Error(message);
  }

  return response.json();
}
