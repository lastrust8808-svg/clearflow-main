import type { EntityRecord, ObligationRecord, PaymentRecord, RecurrenceFrequency } from '../../types/core';
import PageSection from '../ui/PageSection';
import StatCard from '../ui/StatCard';

interface RecurringCommitmentsWorkspaceProps {
  entities: EntityRecord[];
  payments: PaymentRecord[];
  obligations: ObligationRecord[];
  onUpdatePayment: (paymentId: string, updater: (record: PaymentRecord) => PaymentRecord) => void;
  onUpdateObligation: (
    obligationId: string,
    updater: (record: ObligationRecord) => ObligationRecord,
  ) => void;
}

const inputStyle = {
  width: '100%',
  minHeight: 40,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.55)',
  color: '#e5e7eb',
  boxSizing: 'border-box' as const,
};

const recurrenceOptions: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'semimonthly', label: 'Semi-monthly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

const cardStyle = {
  borderRadius: 18,
  padding: 16,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(15,23,42,0.45)',
  display: 'grid',
  gap: 14,
};

const labelStyle = {
  display: 'grid',
  gap: 6,
  color: '#cbd5e1',
  fontSize: 13,
};

export default function RecurringCommitmentsWorkspace({
  entities,
  payments,
  obligations,
  onUpdatePayment,
  onUpdateObligation,
}: RecurringCommitmentsWorkspaceProps) {
  const recurringPayments = payments.filter((item) => item.recurringSchedule?.enabled);
  const recurringObligations = obligations.filter((item) => item.recurringSchedule?.enabled);
  const pausedPayments = payments.filter(
    (item) => item.recurringSchedule && !item.recurringSchedule.enabled,
  );
  const pausedObligations = obligations.filter(
    (item) => item.recurringSchedule && !item.recurringSchedule.enabled,
  );

  const resolveEntityName = (entityId: string) =>
    entities.find((entity) => entity.id === entityId)?.displayName || entityId;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard label="Active Recurring Payments" value={recurringPayments.length} />
        <StatCard label="Active Recurring Obligations" value={recurringObligations.length} />
        <StatCard label="Paused Payment Schedules" value={pausedPayments.length} />
        <StatCard label="Paused Obligation Schedules" value={pausedObligations.length} />
      </div>

      <PageSection
        title="Recurring Payment Engine"
        description="Control payment cadence, next-run dates, and auto-post posture without reopening the original payment entry."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {payments.filter((item) => item.recurringSchedule).length === 0 ? (
            <div style={cardStyle}>No recurring payment schedules have been configured yet.</div>
          ) : (
            payments
              .filter((item) => item.recurringSchedule)
              .map((payment) => {
                const schedule = payment.recurringSchedule!;
                return (
                  <div key={payment.id} style={cardStyle}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>
                          {payment.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} {payment.method}
                        </div>
                        <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                          {resolveEntityName(payment.entityId)} | {payment.currency}{' '}
                          {payment.amount.toLocaleString()} | {payment.status}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePayment(payment.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                enabled: !record.recurringSchedule?.enabled,
                              },
                            }))
                          }
                          style={{
                            padding: '9px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(126,242,255,0.28)',
                            background: schedule.enabled
                              ? 'rgba(54, 215, 255, 0.12)'
                              : 'rgba(255,255,255,0.05)',
                            color: '#effcff',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {schedule.enabled ? 'Pause Schedule' : 'Resume Schedule'}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 12,
                      }}
                    >
                      <label style={labelStyle}>
                        <span>Frequency</span>
                        <select
                          value={schedule.frequency ?? 'monthly'}
                          onChange={(event) =>
                            onUpdatePayment(payment.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                frequency: event.target.value as RecurrenceFrequency,
                              },
                            }))
                          }
                          style={inputStyle}
                        >
                          {recurrenceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={labelStyle}>
                        <span>Interval</span>
                        <input
                          type="number"
                          min="1"
                          value={schedule.interval ?? 1}
                          onChange={(event) =>
                            onUpdatePayment(payment.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                interval: Math.max(1, Number(event.target.value || 1)),
                              },
                            }))
                          }
                          style={inputStyle}
                        />
                      </label>

                      <label style={labelStyle}>
                        <span>Next Run</span>
                        <input
                          type="date"
                          value={schedule.nextRunDate ?? ''}
                          onChange={(event) =>
                            onUpdatePayment(payment.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                nextRunDate: event.target.value,
                              },
                            }))
                          }
                          style={inputStyle}
                        />
                      </label>

                      <label
                        style={{
                          ...labelStyle,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          paddingTop: 24,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={schedule.autoPostEnabled !== false}
                          onChange={(event) =>
                            onUpdatePayment(payment.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                autoPostEnabled: event.target.checked,
                              },
                            }))
                          }
                        />
                        Auto-post into accounting
                      </label>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </PageSection>

      <PageSection
        title="Recurring Obligation Performance"
        description="Schedule coupon presentment and performance cycles on obligations without losing the contract-driven settlement model."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {obligations.filter((item) => item.recurringSchedule).length === 0 ? (
            <div style={cardStyle}>No recurring obligation schedules have been configured yet.</div>
          ) : (
            obligations
              .filter((item) => item.recurringSchedule)
              .map((obligation) => {
                const schedule = obligation.recurringSchedule!;
                return (
                  <div key={obligation.id} style={cardStyle}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{obligation.title}</div>
                        <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>
                          {resolveEntityName(obligation.entityId)} | {obligation.obligationType} |{' '}
                          {obligation.paymentMedium} | {obligation.amount.toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateObligation(obligation.id, (record) => ({
                            ...record,
                            recurringSchedule: {
                              ...record.recurringSchedule!,
                              enabled: !record.recurringSchedule?.enabled,
                            },
                          }))
                        }
                        style={{
                          padding: '9px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(126,242,255,0.28)',
                          background: schedule.enabled
                            ? 'rgba(54, 215, 255, 0.12)'
                            : 'rgba(255,255,255,0.05)',
                          color: '#effcff',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {schedule.enabled ? 'Pause Cycle' : 'Resume Cycle'}
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 12,
                      }}
                    >
                      <label style={labelStyle}>
                        <span>Frequency</span>
                        <select
                          value={schedule.frequency ?? 'monthly'}
                          onChange={(event) =>
                            onUpdateObligation(obligation.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                frequency: event.target.value as RecurrenceFrequency,
                              },
                            }))
                          }
                          style={inputStyle}
                        >
                          {recurrenceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={labelStyle}>
                        <span>Interval</span>
                        <input
                          type="number"
                          min="1"
                          value={schedule.interval ?? 1}
                          onChange={(event) =>
                            onUpdateObligation(obligation.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                interval: Math.max(1, Number(event.target.value || 1)),
                              },
                            }))
                          }
                          style={inputStyle}
                        />
                      </label>

                      <label style={labelStyle}>
                        <span>Next Due</span>
                        <input
                          type="date"
                          value={schedule.nextDueDate ?? ''}
                          onChange={(event) =>
                            onUpdateObligation(obligation.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                nextDueDate: event.target.value,
                              },
                            }))
                          }
                          style={inputStyle}
                        />
                      </label>

                      <label
                        style={{
                          ...labelStyle,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          paddingTop: 24,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={schedule.autoCreatePresentment !== false}
                          onChange={(event) =>
                            onUpdateObligation(obligation.id, (record) => ({
                              ...record,
                              recurringSchedule: {
                                ...record.recurringSchedule!,
                                autoCreatePresentment: event.target.checked,
                              },
                            }))
                          }
                        />
                        Auto-create coupon presentment
                      </label>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </PageSection>
    </div>
  );
}
