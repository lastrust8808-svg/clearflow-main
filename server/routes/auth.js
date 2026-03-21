import express from 'express';
import { isMailerConfigured, sendPlainEmail } from '../utils/mailer.js';
import { isSmsConfigured, sendVerificationSms } from '../utils/messenger.js';

const router = express.Router();

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

export default router;
