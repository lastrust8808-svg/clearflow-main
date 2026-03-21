import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CustomerRecord, InvoiceRecord } from '../../types/core';
import PageSection from '../ui/PageSection';
import RecordCard from '../ui/RecordCard';
import StatCard from '../ui/StatCard';

interface InvoiceOperationsWorkspaceProps {
  invoices: InvoiceRecord[];
  customers: CustomerRecord[];
  onPreview: (invoiceId: string) => void;
  onSend: (invoiceId: string) => void;
  onMarkViewed: (invoiceId: string) => void;
  onExport: (invoiceId: string) => void;
}

const actionButtonStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(126, 242, 255, 0.28)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function InvoiceOperationsWorkspace({
  invoices,
  customers,
  onPreview,
  onSend,
  onMarkViewed,
  onExport,
}: InvoiceOperationsWorkspaceProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(invoices[0]?.id ?? null);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0],
    [invoices, selectedInvoiceId]
  );

  const readyToSend = invoices.filter((invoice) => invoice.deliveryStatus === 'ready_to_send').length;
  const sentCount = invoices.filter((invoice) => invoice.deliveryStatus === 'sent').length;
  const viewedCount = invoices.filter((invoice) => invoice.viewedAt).length;

  const customerLookup = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Ready To Send" value={readyToSend} />
        <StatCard label="Sent" value={sentCount} />
        <StatCard label="Viewed" value={viewedCount} />
      </div>

      <PageSection
        title="Invoice Operations"
        description="Preview, send, export, and mark invoice engagement from the ERP delivery desk."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 1.2fr) minmax(320px, 1fr)',
            gap: 16,
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {invoices.length === 0 ? (
              <div style={{ color: '#d1d5db' }}>No invoice records yet.</div>
            ) : (
              invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 14,
                    border:
                      invoice.id === selectedInvoice?.id
                        ? '1px solid var(--cf-border-strong)'
                        : '1px solid rgba(255,255,255,0.08)',
                    background:
                      invoice.id === selectedInvoice?.id
                        ? 'linear-gradient(135deg, rgba(54, 215, 255, 0.2), rgba(88, 141, 255, 0.12))'
                        : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{invoice.invoiceNumber}</div>
                  <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                    {invoice.deliveryMethod} · {invoice.deliveryStatus ?? 'draft'} · {invoice.totalAmount} {invoice.currency}
                  </div>
                </button>
              ))
            )}
          </div>

          <RecordCard
            title={selectedInvoice?.invoiceNumber ?? 'No Invoice Selected'}
            subtitle={
              selectedInvoice
                ? `${selectedInvoice.deliveryMethod} · ${selectedInvoice.deliveryStatus ?? 'draft'}`
                : 'Choose an invoice to operate on it.'
            }
          >
            {selectedInvoice ? (
              <div style={{ display: 'grid', gap: 10, color: '#dfe6ef', lineHeight: 1.6 }}>
                <div>
                  Customer:{' '}
                  <strong>{customerLookup.get(selectedInvoice.customerId)?.name ?? selectedInvoice.customerId}</strong>
                </div>
                <div>
                  Amount: <strong>{selectedInvoice.currency} {selectedInvoice.totalAmount.toLocaleString()}</strong>
                </div>
                <div>
                  Due: <strong>{selectedInvoice.dueDate ?? 'Not set'}</strong>
                </div>
                <div>
                  Rail: <strong>{selectedInvoice.paymentRailPreference ?? 'manual'}</strong>
                </div>
                <div>
                  Verification: <strong>{selectedInvoice.verificationRequired ? 'required' : 'standard'}</strong>
                </div>
                <div>
                  Notes: <strong>{selectedInvoice.deliveryNotes ?? selectedInvoice.notes ?? 'No delivery notes yet.'}</strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                  <button type="button" style={actionButtonStyle} onClick={() => onPreview(selectedInvoice.id)}>
                    Preview
                  </button>
                  <button type="button" style={actionButtonStyle} onClick={() => onSend(selectedInvoice.id)}>
                    Send
                  </button>
                  <button type="button" style={actionButtonStyle} onClick={() => onMarkViewed(selectedInvoice.id)}>
                    Mark Viewed
                  </button>
                  <button type="button" style={actionButtonStyle} onClick={() => onExport(selectedInvoice.id)}>
                    Export Packet
                  </button>
                </div>
              </div>
            ) : null}
          </RecordCard>
        </div>
      </PageSection>
    </div>
  );
}
