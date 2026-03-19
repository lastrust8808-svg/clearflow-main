import React, { useMemo, useState } from 'react';

type InstrumentType =
  | 'note'
  | 'bond'
  | 'coupon'
  | 'strip'
  | 'tax_exempt'
  | 'tips'
  | 'contingent';

type OIDMethod = 'constant_yield' | 'coupon_bond' | 'discount_bond';

type DebtInstrumentForm = {
  instrumentName: string;
  instrumentType: InstrumentType;
  issuer: string;
  holder: string;
  assetReference: string;
  ledgerAccount: string;
  issueDate: string;
  purchaseDate: string;
  maturityDate: string;
  faceAmount: number;
  issuePrice: number;
  purchasePrice: number;
  statedRedemptionAtMaturity: number;
  couponRate: number;
  yieldToMaturity: number;
  accrualsPerYear: number;
  qualifiedStatedInterest: number;
  taxExempt: boolean;
  inflationIndexed: boolean;
  contingentPayment: boolean;
  coveredSecurity: boolean;
  applyOIDRules: boolean;
  useDeMinimisRule: boolean;
  notes: string;
};

type ScheduleRow = {
  period: number;
  periodStart: string;
  periodEnd: string;
  beginningAdjustedIssuePrice: number;
  interestAtYield: number;
  qualifiedStatedInterest: number;
  oidAccrual: number;
  endingAdjustedIssuePrice: number;
  basisAfterAccrual: number;
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function deMinimisThreshold(redemption: number, issueDate: Date | null, maturityDate: Date | null): number {
  if (!issueDate || !maturityDate || redemption <= 0) return 0;
  const fullYears = Math.max(
    0,
    Math.floor((maturityDate.getTime() - issueDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  );
  return redemption * 0.0025 * fullYears;
}

function buildSchedule(form: DebtInstrumentForm): ScheduleRow[] {
  const issueDate = toDate(form.issueDate);
  const maturityDate = toDate(form.maturityDate);
  if (!issueDate || !maturityDate || maturityDate <= issueDate) return [];

  const periodsPerYear = Math.max(1, Math.floor(form.accrualsPerYear || 2));
  const monthsPerPeriod = Math.max(1, Math.round(12 / periodsPerYear));
  const totalMonths = Math.max(1, monthsBetween(issueDate, maturityDate));
  const periods = Math.max(1, Math.ceil(totalMonths / monthsPerPeriod));

  let aip = safeNumber(form.issuePrice);
  let basis = safeNumber(form.purchasePrice || form.issuePrice);
  const qsiPerPeriod = safeNumber(
    form.qualifiedStatedInterest || ((form.faceAmount * (form.couponRate / 100)) / periodsPerYear)
  );
  const yieldPerPeriod = safeNumber(form.yieldToMaturity / 100) / periodsPerYear;

  const rows: ScheduleRow[] = [];

  for (let i = 0; i < periods; i += 1) {
    const start = addMonths(issueDate, i * monthsPerPeriod);
    const end = i === periods - 1 ? maturityDate : addMonths(issueDate, (i + 1) * monthsPerPeriod);

    const interestAtYield = round2(aip * yieldPerPeriod);
    let oidAccrual = round2(interestAtYield - qsiPerPeriod);

    if (i === periods - 1) {
      oidAccrual = round2(form.statedRedemptionAtMaturity - aip);
    }

    const endingAIP = round2(aip + oidAccrual);
    basis = round2(basis + Math.max(0, oidAccrual));

    rows.push({
      period: i + 1,
      periodStart: formatDate(start),
      periodEnd: formatDate(end),
      beginningAdjustedIssuePrice: round2(aip),
      interestAtYield,
      qualifiedStatedInterest: round2(qsiPerPeriod),
      oidAccrual,
      endingAdjustedIssuePrice: endingAIP,
      basisAfterAccrual: basis,
    });

    aip = endingAIP;
  }

  return rows;
}

function deriveTaxProfile(form: DebtInstrumentForm) {
  const issueDate = toDate(form.issueDate);
  const maturityDate = toDate(form.maturityDate);
  const rawOID = round2(form.statedRedemptionAtMaturity - form.issuePrice);
  const threshold = deMinimisThreshold(form.statedRedemptionAtMaturity, issueDate, maturityDate);
  const deMinimis = form.useDeMinimisRule && rawOID > 0 && rawOID < threshold;

  const purchasePrice = form.purchasePrice || form.issuePrice;
  const acquisitionPremium = Math.max(0, round2(purchasePrice - form.issuePrice));
  const premium = Math.max(0, round2(purchasePrice - form.statedRedemptionAtMaturity));
  const marketDiscount = Math.max(0, round2(form.issuePrice - purchasePrice));

  let oidMethod: OIDMethod = 'constant_yield';
  if (form.inflationIndexed) oidMethod = 'coupon_bond';
  if (form.instrumentType === 'strip' || form.instrumentType === 'coupon') oidMethod = 'discount_bond';

  return {
    rawOID,
    deMinimisThreshold: round2(threshold),
    deMinimis,
    recognizedOID: deMinimis ? 0 : rawOID,
    acquisitionPremium,
    premium,
    marketDiscount,
    oidMethod,
    hasOID: rawOID > 0 && !deMinimis,
    basisStart: purchasePrice,
  };
}

function makeLedgerPayload(form: DebtInstrumentForm, schedule: ScheduleRow[]) {
  const profile = deriveTaxProfile(form);
  return {
    entity: 'debt_instrument',
    version: 1,
    createdAt: new Date().toISOString(),
    instrument: {
      name: form.instrumentName,
      type: form.instrumentType,
      issuer: form.issuer,
      holder: form.holder,
      assetReference: form.assetReference,
      ledgerAccount: form.ledgerAccount,
      issueDate: form.issueDate,
      purchaseDate: form.purchaseDate || form.issueDate,
      maturityDate: form.maturityDate,
      faceAmount: round2(form.faceAmount),
      issuePrice: round2(form.issuePrice),
      purchasePrice: round2(form.purchasePrice || form.issuePrice),
      statedRedemptionAtMaturity: round2(form.statedRedemptionAtMaturity),
      couponRate: round2(form.couponRate),
      yieldToMaturity: round2(form.yieldToMaturity),
      accrualsPerYear: form.accrualsPerYear,
      qualifiedStatedInterest: round2(
        form.qualifiedStatedInterest ||
          ((form.faceAmount * (form.couponRate / 100)) / Math.max(1, form.accrualsPerYear))
      ),
      taxExempt: form.taxExempt,
      inflationIndexed: form.inflationIndexed,
      contingentPayment: form.contingentPayment,
      coveredSecurity: form.coveredSecurity,
      applyOIDRules: form.applyOIDRules,
      notes: form.notes,
    },
    taxProfile: profile,
    schedule,
    ledgerPostingTemplate: schedule.slice(0, 3).map((row) => ({
      period: row.period,
      postingDate: row.periodEnd,
      entries: [
        {
          account: `${form.ledgerAccount || 'Debt Instrument'}:Adjusted Basis`,
          side: 'debit',
          amount: Math.max(0, row.oidAccrual),
          memo: `OID accrual period ${row.period}`,
        },
        {
          account: `${form.ledgerAccount || 'Debt Instrument'}:OID Income`,
          side: 'credit',
          amount: Math.max(0, row.oidAccrual),
          memo: `OID recognition period ${row.period}`,
        },
      ],
    })),
  };
}

const defaultForm: DebtInstrumentForm = {
  instrumentName: '',
  instrumentType: 'note',
  issuer: '',
  holder: '',
  assetReference: '',
  ledgerAccount: 'Debt Instruments/OID',
  issueDate: '',
  purchaseDate: '',
  maturityDate: '',
  faceAmount: 100000,
  issuePrice: 95000,
  purchasePrice: 95000,
  statedRedemptionAtMaturity: 100000,
  couponRate: 0,
  yieldToMaturity: 5,
  accrualsPerYear: 2,
  qualifiedStatedInterest: 0,
  taxExempt: false,
  inflationIndexed: false,
  contingentPayment: false,
  coveredSecurity: true,
  applyOIDRules: true,
  useDeMinimisRule: true,
  notes: '',
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = '0.01',
}: {
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <input
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500"
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500"
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left ${
        checked ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white'
      }`}
    >
      <span className="text-sm text-slate-800">{label}</span>
      <span className={`h-5 w-10 rounded-full p-1 transition ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span
          className={`block h-3 w-3 rounded-full bg-white transition ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

export default function OIDDebtInstrumentModule() {
  const [open, setOpen] = useState(false);
  const [savedPayload, setSavedPayload] = useState<any | null>(null);
  const [tab, setTab] = useState<'terms' | 'tax' | 'schedule' | 'review'>('terms');
  const [form, setForm] = useState<DebtInstrumentForm>(defaultForm);

  const taxProfile = useMemo(() => deriveTaxProfile(form), [form]);
  const schedule = useMemo(() => (form.applyOIDRules ? buildSchedule(form) : []), [form]);
  const payload = useMemo(() => makeLedgerPayload(form, schedule), [form, schedule]);

  function update<K extends keyof DebtInstrumentForm>(key: K, value: DebtInstrumentForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function loadExample() {
    setForm({
      ...defaultForm,
      instrumentName: 'Asset-Backed Private Note A-2026-01',
      instrumentType: 'note',
      issuer: 'LAS Trust Finance Desk',
      holder: 'Rockdale Holding Company',
      assetReference: 'Macomb Storage Unit Acquisition',
      issueDate: '2026-03-14',
      purchaseDate: '2026-03-14',
      maturityDate: '2031-03-14',
      faceAmount: 100000,
      issuePrice: 92000,
      purchasePrice: 92000,
      statedRedemptionAtMaturity: 100000,
      couponRate: 2,
      yieldToMaturity: 4.15,
      accrualsPerYear: 2,
      qualifiedStatedInterest: 1000,
      notes: 'Prototype asset-backed internal debt instrument with OID profile.',
    });
  }

  function saveInstrument() {
    setSavedPayload(payload);
    setOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">OID Debt Instrument Ledger Module</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Add a debt instrument to the ledger using OID-oriented tax-accounting structure:
                issue price, stated redemption at maturity, accrual yield, basis tracking, and posting preview.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadExample}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Load Example
              </button>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + Add Debt Instrument
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Recognized OID</div>
              <div className="mt-2 text-2xl font-semibold">{currency.format(taxProfile.recognizedOID)}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">OID Method</div>
              <div className="mt-2 text-2xl font-semibold">{taxProfile.oidMethod}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Acquisition Premium</div>
              <div className="mt-2 text-2xl font-semibold">{currency.format(taxProfile.acquisitionPremium)}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Market Discount</div>
              <div className="mt-2 text-2xl font-semibold">{currency.format(taxProfile.marketDiscount)}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Accrual Schedule Preview</h2>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-left">Start</th>
                    <th className="px-3 py-2 text-left">End</th>
                    <th className="px-3 py-2 text-left">Beg. AIP</th>
                    <th className="px-3 py-2 text-left">Yield Int.</th>
                    <th className="px-3 py-2 text-left">QSI</th>
                    <th className="px-3 py-2 text-left">OID</th>
                    <th className="px-3 py-2 text-left">End AIP</th>
                    <th className="px-3 py-2 text-left">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        No schedule yet. Load the example or add a debt instrument.
                      </td>
                    </tr>
                  ) : (
                    schedule.slice(0, 12).map((row) => (
                      <tr key={row.period} className="border-t border-slate-200">
                        <td className="px-3 py-2">{row.period}</td>
                        <td className="px-3 py-2">{row.periodStart}</td>
                        <td className="px-3 py-2">{row.periodEnd}</td>
                        <td className="px-3 py-2">{currency.format(row.beginningAdjustedIssuePrice)}</td>
                        <td className="px-3 py-2">{currency.format(row.interestAtYield)}</td>
                        <td className="px-3 py-2">{currency.format(row.qualifiedStatedInterest)}</td>
                        <td className="px-3 py-2 font-medium">{currency.format(row.oidAccrual)}</td>
                        <td className="px-3 py-2">{currency.format(row.endingAdjustedIssuePrice)}</td>
                        <td className="px-3 py-2">{currency.format(row.basisAfterAccrual)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">Ledger Posting Preview</h2>
              <div className="space-y-3">
                {payload.ledgerPostingTemplate.length === 0 ? (
                  <div className="text-sm text-slate-500">No postings available yet.</div>
                ) : (
                  payload.ledgerPostingTemplate.map((posting: any) => (
                    <div key={posting.period} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium">Period {posting.period}</span>
                        <span className="text-xs text-slate-500">{posting.postingDate}</span>
                      </div>
                      {posting.entries.map((entry: any, index: number) => (
                        <div key={index} className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">
                          <div className="font-medium">{entry.account}</div>
                          <div className="text-slate-600">
                            {entry.side.toUpperCase()} · {currency.format(entry.amount)}
                          </div>
                          <div className="text-xs text-slate-500">{entry.memo}</div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">Saved Payload</h2>
              <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(savedPayload ?? payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50">
          <div className="h-full w-full max-w-4xl overflow-auto bg-white shadow-2xl">
            <div className="sticky top-0 border-b border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Create Debt Instrument</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Build an OID-oriented instrument record for the ledger.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveInstrument}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Save Instrument
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(['terms', 'tax', 'schedule', 'review'] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setTab(name)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      tab === name
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {name === 'terms' && 'Terms'}
                    {name === 'tax' && 'Tax Rules'}
                    {name === 'schedule' && 'Accrual'}
                    {name === 'review' && 'Review'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {tab === 'terms' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Instrument Name">
                    <TextInput
                      value={form.instrumentName}
                      onChange={(v) => update('instrumentName', v)}
                      placeholder="Asset-Backed Private Note A-2026-01"
                    />
                  </Field>

                  <Field label="Instrument Type">
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      value={form.instrumentType}
                      onChange={(e) => update('instrumentType', e.target.value as InstrumentType)}
                    >
                      <option value="note">Note</option>
                      <option value="bond">Bond</option>
                      <option value="coupon">Coupon</option>
                      <option value="strip">STRIP</option>
                      <option value="tax_exempt">Tax-Exempt Bond</option>
                      <option value="tips">Inflation-Indexed / TIPS</option>
                      <option value="contingent">Contingent Payment</option>
                    </select>
                  </Field>

                  <Field label="Issuer">
                    <TextInput value={form.issuer} onChange={(v) => update('issuer', v)} placeholder="Issuer entity" />
                  </Field>

                  <Field label="Holder">
                    <TextInput value={form.holder} onChange={(v) => update('holder', v)} placeholder="Holder entity" />
                  </Field>

                  <Field label="Asset Reference">
                    <TextInput
                      value={form.assetReference}
                      onChange={(v) => update('assetReference', v)}
                      placeholder="Underlying asset or deal reference"
                    />
                  </Field>

                  <Field label="Ledger Account">
                    <TextInput
                      value={form.ledgerAccount}
                      onChange={(v) => update('ledgerAccount', v)}
                      placeholder="Debt Instruments/OID"
                    />
                  </Field>

                  <Field label="Issue Date">
                    <TextInput type="date" value={form.issueDate} onChange={(v) => update('issueDate', v)} />
                  </Field>

                  <Field label="Purchase Date">
                    <TextInput type="date" value={form.purchaseDate} onChange={(v) => update('purchaseDate', v)} />
                  </Field>

                  <Field label="Maturity Date">
                    <TextInput type="date" value={form.maturityDate} onChange={(v) => update('maturityDate', v)} />
                  </Field>

                  <Field label="Face Amount">
                    <NumberInput value={form.faceAmount} onChange={(v) => update('faceAmount', v)} />
                  </Field>

                  <Field label="Issue Price">
                    <NumberInput value={form.issuePrice} onChange={(v) => update('issuePrice', v)} />
                  </Field>

                  <Field label="Purchase Price">
                    <NumberInput value={form.purchasePrice} onChange={(v) => update('purchasePrice', v)} />
                  </Field>

                  <Field label="Stated Redemption at Maturity">
                    <NumberInput
                      value={form.statedRedemptionAtMaturity}
                      onChange={(v) => update('statedRedemptionAtMaturity', v)}
                    />
                  </Field>

                  <Field label="Coupon Rate (%)">
                    <NumberInput value={form.couponRate} onChange={(v) => update('couponRate', v)} step="0.0001" />
                  </Field>

                  <Field label="Yield to Maturity (%)">
                    <NumberInput
                      value={form.yieldToMaturity}
                      onChange={(v) => update('yieldToMaturity', v)}
                      step="0.0001"
                    />
                  </Field>

                  <Field label="Accruals Per Year">
                    <NumberInput
                      value={form.accrualsPerYear}
                      onChange={(v) => update('accrualsPerYear', Math.max(1, Math.round(v)))}
                      step="1"
                    />
                  </Field>

                  <Field label="Qualified Stated Interest (per accrual period)">
                    <NumberInput
                      value={form.qualifiedStatedInterest}
                      onChange={(v) => update('qualifiedStatedInterest', v)}
                    />
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Internal Notes">
                      <textarea
                        className="min-h-[120px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500"
                        value={form.notes}
                        onChange={(e) => update('notes', e.target.value)}
                        placeholder="Purpose, deal notes, supporting facts, custom treatment notes."
                      />
                    </Field>
                  </div>
                </div>
              )}

              {tab === 'tax' && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Toggle checked={form.applyOIDRules} onChange={(v) => update('applyOIDRules', v)} label="Apply OID Rules" />
                    <Toggle checked={form.useDeMinimisRule} onChange={(v) => update('useDeMinimisRule', v)} label="Use De Minimis Rule" />
                    <Toggle checked={form.taxExempt} onChange={(v) => update('taxExempt', v)} label="Tax-Exempt" />
                    <Toggle checked={form.inflationIndexed} onChange={(v) => update('inflationIndexed', v)} label="Inflation-Indexed" />
                    <Toggle checked={form.contingentPayment} onChange={(v) => update('contingentPayment', v)} label="Contingent Payment" />
                    <Toggle checked={form.coveredSecurity} onChange={(v) => update('coveredSecurity', v)} label="Covered Security" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Raw OID</div>
                      <div className="mt-2 text-2xl font-semibold">{currency.format(taxProfile.rawOID)}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">De Minimis Threshold</div>
                      <div className="mt-2 text-2xl font-semibold">{currency.format(taxProfile.deMinimisThreshold)}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Method</div>
                      <div className="mt-2 text-2xl font-semibold">{taxProfile.oidMethod}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="mb-3 font-semibold text-slate-800">Derived tax profile</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>Recognized OID: <span className="font-medium">{currency.format(taxProfile.recognizedOID)}</span></div>
                      <div>Acquisition Premium: <span className="font-medium">{currency.format(taxProfile.acquisitionPremium)}</span></div>
                      <div>Premium: <span className="font-medium">{currency.format(taxProfile.premium)}</span></div>
                      <div>Market Discount: <span className="font-medium">{currency.format(taxProfile.marketDiscount)}</span></div>
                      <div>Has OID: <span className="font-medium">{taxProfile.hasOID ? 'Yes' : 'No'}</span></div>
                      <div>Starting Basis: <span className="font-medium">{currency.format(taxProfile.basisStart)}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'schedule' && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Periods</div>
                      <div className="mt-2 text-2xl font-semibold">{schedule.length}</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Total OID Preview</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {currency.format(schedule.reduce((sum, row) => sum + row.oidAccrual, 0))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Final Adjusted Issue Price</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {currency.format(schedule[schedule.length - 1]?.endingAdjustedIssuePrice ?? 0)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Final Basis</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {currency.format(schedule[schedule.length - 1]?.basisAfterAccrual ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Start</th>
                          <th className="px-3 py-2 text-left">End</th>
                          <th className="px-3 py-2 text-left">Beg. AIP</th>
                          <th className="px-3 py-2 text-left">OID</th>
                          <th className="px-3 py-2 text-left">Basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.slice(0, 10).map((row) => (
                          <tr key={row.period} className="border-t border-slate-200">
                            <td className="px-3 py-2">{row.period}</td>
                            <td className="px-3 py-2">{row.periodStart}</td>
                            <td className="px-3 py-2">{row.periodEnd}</td>
                            <td className="px-3 py-2">{currency.format(row.beginningAdjustedIssuePrice)}</td>
                            <td className="px-3 py-2">{currency.format(row.oidAccrual)}</td>
                            <td className="px-3 py-2">{currency.format(row.basisAfterAccrual)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'review' && (
                <pre className="max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}