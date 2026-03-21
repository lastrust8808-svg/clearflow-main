import type {
  CustomerRecord,
  EntityRecord,
  InvoiceRecord,
  WorkspaceSettingsRecord,
} from '../types/core';

export interface InvoiceDeliveryResolution {
  recipientEmail?: string;
  emailReady: boolean;
  needsManualAttachment: boolean;
  actionLabel: string;
  helperText: string;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function sanitizeFileName(value: string) {
  return (value || 'invoice')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function resolveInvoiceRecipientEmail(
  invoice: InvoiceRecord,
  customer?: CustomerRecord
) {
  return invoice.recipientEmail?.trim() || customer?.email?.trim() || undefined;
}

export function getInvoiceDeliveryResolution(
  invoice: InvoiceRecord,
  customer?: CustomerRecord
): InvoiceDeliveryResolution {
  const recipientEmail = resolveInvoiceRecipientEmail(invoice, customer);

  if (invoice.deliveryMethod === 'email') {
    if (recipientEmail) {
      return {
        recipientEmail,
        emailReady: true,
        needsManualAttachment: true,
        actionLabel: 'Open Email Draft',
        helperText:
          'Client email is on file. ClearFlow will open your mail app and download the invoice packet so you can attach and send it.',
      };
    }

    return {
      recipientEmail: undefined,
      emailReady: false,
      needsManualAttachment: true,
      actionLabel: 'Download Packet',
      helperText:
        'No client email is on file yet. Download the invoice packet and attach it manually once their email is available.',
    };
  }

  if (invoice.deliveryMethod === 'internal_user') {
    return {
      recipientEmail,
      emailReady: false,
      needsManualAttachment: false,
      actionLabel: 'Queue Internal Delivery',
      helperText:
        'This invoice is configured for internal ClearFlow delivery rather than email.',
    };
  }

  return {
    recipientEmail,
    emailReady: false,
    needsManualAttachment: true,
    actionLabel: 'Download Packet',
    helperText:
      'This invoice is set for export/manual delivery. ClearFlow will download the invoice packet for attachment or offline sending.',
  };
}

export function buildInvoicePacketHtml(options: {
  invoice: InvoiceRecord;
  customer?: CustomerRecord;
  entity?: EntityRecord;
}) {
  const { invoice, customer, entity } = options;
  const issuedBy =
    entity?.branding?.emailFromName || entity?.displayName || entity?.name || 'ClearFlow';
  const customerName = customer?.name || 'Customer';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${invoice.invoiceNumber}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        padding: 32px;
        font-family: Georgia, "Times New Roman", serif;
        background: #f7fafc;
        color: #10213a;
      }
      .sheet {
        max-width: 880px;
        margin: 0 auto;
        padding: 36px;
        background: white;
        border: 1px solid #d9e3ee;
        border-radius: 24px;
        box-shadow: 0 18px 50px rgba(16, 33, 58, 0.08);
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #3f7ea2;
      }
      h1 {
        margin: 8px 0 6px;
        font-size: 34px;
      }
      .grid {
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 28px;
      }
      .card {
        padding: 18px;
        border-radius: 18px;
        background: #f6fbff;
        border: 1px solid #d3e7f2;
      }
      .label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #5f7287;
      }
      .value {
        margin-top: 8px;
        font-size: 20px;
        font-weight: 700;
      }
      .notes {
        margin-top: 24px;
        padding: 18px;
        border-radius: 18px;
        background: #0f2b3d;
        color: #f4fbff;
      }
      p {
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="eyebrow">ClearFlow Invoice Packet</div>
      <h1>${invoice.invoiceNumber}</h1>
      <p>Prepared for ${customerName} by ${issuedBy}.</p>

      <div class="grid">
        <div class="card">
          <div class="label">Issue Date</div>
          <div class="value">${invoice.issueDate}</div>
        </div>
        <div class="card">
          <div class="label">Due Date</div>
          <div class="value">${invoice.dueDate || 'Not set'}</div>
        </div>
        <div class="card">
          <div class="label">Amount Due</div>
          <div class="value">${formatCurrency(invoice.balanceDue, invoice.currency)}</div>
        </div>
        <div class="card">
          <div class="label">Settlement Preference</div>
          <div class="value">${invoice.paymentRailPreference || 'manual'}</div>
        </div>
      </div>

      <div class="notes">
        <div class="label" style="color:#a7dff8;">Payment Instructions</div>
        <p>${invoice.paymentInstructions || invoice.brandingSnapshot?.footerNote || 'Reference this invoice number with payment and retain supporting records in your ClearFlow vault.'}</p>
      </div>
    </div>
  </body>
</html>`;
}

export function buildInvoicePacketFileName(invoice: InvoiceRecord) {
  return `${sanitizeFileName(invoice.invoiceNumber)}.html`;
}

export function buildInvoiceEmailPayload(options: {
  invoice: InvoiceRecord;
  customer?: CustomerRecord;
  entity?: EntityRecord;
  workspaceSettings?: WorkspaceSettingsRecord;
}) {
  const { invoice, customer, entity, workspaceSettings } = options;
  const recipientEmail = resolveInvoiceRecipientEmail(invoice, customer);
  const attachmentFileName = buildInvoicePacketFileName(invoice);
  const senderName =
    entity?.branding?.emailFromName || entity?.displayName || entity?.name || 'ClearFlow';
  const supportEmail = workspaceSettings?.supportEmail || '';
  const subject = `${senderName} Invoice ${invoice.invoiceNumber}`;
  const textBody = [
    `Hello ${customer?.name || 'there'},`,
    '',
    `Your invoice ${invoice.invoiceNumber} is ready.`,
    `Amount due: ${formatCurrency(invoice.totalAmount, invoice.currency)}`,
    `Due date: ${invoice.dueDate || 'Not set'}`,
    '',
    invoice.paymentInstructions
      ? `Payment instructions: ${invoice.paymentInstructions}`
      : 'Payment instructions are included in the attached invoice packet.',
    '',
    supportEmail ? `Reply contact: ${supportEmail}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const attachmentHtml = buildInvoicePacketHtml({ invoice, customer, entity });

  return {
    recipientEmail,
    subject,
    textBody,
    htmlBody: attachmentHtml,
    attachmentFileName,
    attachmentHtml,
    replyTo: supportEmail || undefined,
  };
}

export function downloadInvoicePacket(options: {
  invoice: InvoiceRecord;
  customer?: CustomerRecord;
  entity?: EntityRecord;
}) {
  const { invoice, customer, entity } = options;
  const fileName = buildInvoicePacketFileName(invoice);
  const html = buildInvoicePacketHtml({ invoice, customer, entity });

  if (typeof window !== 'undefined') {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { fileName };
}

export function openInvoiceEmailDraft(options: {
  invoice: InvoiceRecord;
  customer?: CustomerRecord;
  entity?: EntityRecord;
  workspaceSettings?: WorkspaceSettingsRecord;
  attachmentFileName: string;
}) {
  const { attachmentFileName } = options;
  const payload = buildInvoiceEmailPayload(options);
  const { recipientEmail } = payload;
  if (!recipientEmail || typeof window === 'undefined') {
    return false;
  }

  const body = [
    payload.textBody,
    '',
    `ClearFlow has downloaded ${attachmentFileName} locally so you can attach it before sending.`,
  ].join('\n');

  const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(
    payload.subject
  )}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
  return true;
}
