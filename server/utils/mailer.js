import nodemailer from 'nodemailer';

let transporter;

function toBoolean(value) {
  return String(value).toLowerCase() === 'true';
}

export function isMailerConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL
  );
}

function getTransporter() {
  if (!isMailerConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: toBoolean(process.env.SMTP_SECURE),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendInvoiceEmail({
  to,
  subject,
  text,
  html,
  attachmentFileName,
  attachmentHtml,
  replyTo,
  fromName,
}) {
  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    throw new Error('SMTP is not configured.');
  }

  const fromAddress = process.env.SMTP_FROM_EMAIL;
  const senderName = fromName || process.env.SMTP_FROM_NAME || 'ClearFlow';

  const info = await activeTransporter.sendMail({
    from: `"${senderName}" <${fromAddress}>`,
    to,
    replyTo: replyTo || fromAddress,
    subject,
    text,
    html,
    attachments:
      attachmentFileName && attachmentHtml
        ? [
            {
              filename: attachmentFileName,
              content: attachmentHtml,
              contentType: 'text/html',
            },
          ]
        : [],
  });

  return info;
}

export async function sendPlainEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  fromName,
}) {
  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    throw new Error('SMTP is not configured.');
  }

  const fromAddress = process.env.SMTP_FROM_EMAIL;
  const senderName = fromName || process.env.SMTP_FROM_NAME || 'ClearFlow';

  return activeTransporter.sendMail({
    from: `"${senderName}" <${fromAddress}>`,
    to,
    replyTo: replyTo || fromAddress,
    subject,
    text,
    html,
  });
}
