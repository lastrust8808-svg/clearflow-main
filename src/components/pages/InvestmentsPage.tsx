import { useMemo, useState } from 'react';
import type { CoreDataBundle } from '../../types/core';

interface InvestmentsPageProps {
  data: CoreDataBundle;
}

type FundingPath = 'cash' | 'loan' | 'seller_finance' | 'partner_capital' | 'project_funding';

const inputStyle = {
  width: '100%',
  minHeight: 42,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.24)',
  background: 'rgba(15,23,42,0.54)',
  color: '#e5eef7',
  boxSizing: 'border-box' as const,
};

const cardStyle = {
  borderRadius: 20,
  padding: 20,
  background: 'rgba(15,23,42,0.52)',
  border: '1px solid rgba(126,242,255,0.16)',
  color: '#e5eef7',
};

function asNumber(value: string) {
  return Number(value || 0);
}

function currency(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function percent(value: number) {
  return `${value.toFixed(2)}%`;
}

const placementOptions = [
  {
    label: 'Treasury bills / money market posture',
    horizon: 'days to 12 months',
    use: 'Short-term parking while documents, exchange windows, or project diligence are pending.',
  },
  {
    label: 'Certificates of deposit',
    horizon: '1 month to multi-year ladder',
    use: 'Known maturity windows when funds should not be exposed to market volatility.',
  },
  {
    label: 'High-yield operating reserve',
    horizon: 'daily liquidity',
    use: 'Reserve cash visibility before deployment into projects, debt payoff, or property acquisition.',
  },
  {
    label: 'Paper-trading strategy lab',
    horizon: 'simulation first',
    use: 'Practice automated strategies and risk rules before considering any live brokerage execution.',
  },
];

const exchangeChecklist = [
  'Confirm the relinquished and replacement property are held for investment or business use.',
  'Do not take constructive receipt of proceeds; route funds through a qualified intermediary.',
  'Identify replacement property within the 45-day identification window.',
  'Complete acquisition within the 180-day exchange window or tax-return due date if earlier.',
  'Retain closing statements, exchange agreement, notices, assignment documents, and entity authority proof.',
  'Coordinate tax, legal, title, lender, and qualified intermediary review before execution.',
];

export default function InvestmentsPage({ data }: InvestmentsPageProps) {
  const [purchasePrice, setPurchasePrice] = useState('250000');
  const [rehabBudget, setRehabBudget] = useState('35000');
  const [closingCosts, setClosingCosts] = useState('7500');
  const [afterRepairValue, setAfterRepairValue] = useState('335000');
  const [monthlyRent, setMonthlyRent] = useState('2800');
  const [monthlyOperatingCosts, setMonthlyOperatingCosts] = useState('950');
  const [holdMonths, setHoldMonths] = useState('12');
  const [loanEnabled, setLoanEnabled] = useState(true);
  const [downPaymentPercent, setDownPaymentPercent] = useState('20');
  const [interestRate, setInterestRate] = useState('8.5');
  const [loanYears, setLoanYears] = useState('30');
  const [fundingPath, setFundingPath] = useState<FundingPath>('loan');
  const [strategyCapital, setStrategyCapital] = useState('1000');
  const [maxDailyLoss, setMaxDailyLoss] = useState('2');

  const deal = useMemo(() => {
    const price = asNumber(purchasePrice);
    const rehab = asNumber(rehabBudget);
    const close = asNumber(closingCosts);
    const arv = asNumber(afterRepairValue);
    const rent = asNumber(monthlyRent);
    const operating = asNumber(monthlyOperatingCosts);
    const months = Math.max(asNumber(holdMonths), 1);
    const downPct = loanEnabled ? asNumber(downPaymentPercent) / 100 : 1;
    const loanPrincipal = loanEnabled ? Math.max(price * (1 - downPct), 0) : 0;
    const monthlyRate = asNumber(interestRate) / 100 / 12;
    const payments = Math.max(asNumber(loanYears) * 12, 1);
    const debtService =
      loanEnabled && monthlyRate > 0
        ? (loanPrincipal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -payments))
        : loanEnabled
          ? loanPrincipal / payments
          : 0;
    const upfrontCash = loanEnabled ? price * downPct + rehab + close : price + rehab + close;
    const netMonthlyCashflow = rent - operating - debtService;
    const totalProjectCost = price + rehab + close;
    const equitySpread = arv - totalProjectCost;
    const cashOnCash = upfrontCash > 0 ? (netMonthlyCashflow * 12 / upfrontCash) * 100 : 0;
    const projectedHoldProfit = equitySpread + netMonthlyCashflow * months;
    const roi = upfrontCash > 0 ? (projectedHoldProfit / upfrontCash) * 100 : 0;

    return {
      totalProjectCost,
      upfrontCash,
      loanPrincipal,
      debtService,
      netMonthlyCashflow,
      equitySpread,
      cashOnCash,
      projectedHoldProfit,
      roi,
    };
  }, [
    afterRepairValue,
    closingCosts,
    downPaymentPercent,
    holdMonths,
    interestRate,
    loanEnabled,
    loanYears,
    monthlyOperatingCosts,
    monthlyRent,
    purchasePrice,
    rehabBudget,
  ]);

  const activeEntityCount = data.entities.filter((entity) => entity.status === 'active').length;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, display: 'grid', gap: 10 }}>
        <div style={{ color: '#7ef2ff', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800 }}>
          Investment Resource
        </div>
        <div style={{ fontSize: 30, fontWeight: 850 }}>
          Strategy education, deal generation, funding paths, and execution packets.
        </div>
        <div style={{ color: '#cbd5e1', lineHeight: 1.7, maxWidth: 980 }}>
          Use this workspace to model real estate projects, prepare 1031 exchange packet
          requirements, compare short-term reinvestment paths, and simulate automated trading
          strategies before any live-money execution is considered.
        </div>
        <div style={{ color: '#facc15', lineHeight: 1.6 }}>
          Educational and planning workspace only. Live trading, securities advice, and exchange
          execution should require qualified provider connections, user approval, and professional review.
        </div>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Real Estate Deal Analyzer</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Estimate upfront cost, leverage, ROI, monthly cost, cashflow, and budget spread.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {[
            ['Purchase Price', purchasePrice, setPurchasePrice],
            ['Rehab / Material Budget', rehabBudget, setRehabBudget],
            ['Closing Costs', closingCosts, setClosingCosts],
            ['After Repair Value', afterRepairValue, setAfterRepairValue],
            ['Monthly Rent / Income', monthlyRent, setMonthlyRent],
            ['Monthly Operating Costs', monthlyOperatingCosts, setMonthlyOperatingCosts],
            ['Hold Months', holdMonths, setHoldMonths],
          ].map(([label, value, setter]) => (
            <label key={label as string} style={{ display: 'grid', gap: 6 }}>
              <span>{label as string}</span>
              <input
                type="number"
                value={value as string}
                onChange={(event) => (setter as (next: string) => void)(event.target.value)}
                style={inputStyle}
              />
            </label>
          ))}
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" checked={loanEnabled} onChange={(event) => setLoanEnabled(event.target.checked)} />
          Include loan terms in the model
        </label>

        {loanEnabled ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Down Payment %</span>
              <input type="number" value={downPaymentPercent} onChange={(event) => setDownPaymentPercent(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Interest Rate %</span>
              <input type="number" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Loan Years</span>
              <input type="number" value={loanYears} onChange={(event) => setLoanYears(event.target.value)} style={inputStyle} />
            </label>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {[
            ['Total Project Cost', currency(deal.totalProjectCost)],
            ['Upfront Cash Needed', currency(deal.upfrontCash)],
            ['Loan Principal', currency(deal.loanPrincipal)],
            ['Monthly Debt Service', currency(deal.debtService)],
            ['Net Monthly Cashflow', currency(deal.netMonthlyCashflow)],
            ['Budget Spread / Equity', currency(deal.equitySpread)],
            ['Cash-on-Cash', percent(deal.cashOnCash)],
            ['Projected Hold ROI', percent(deal.roi)],
          ].map(([label, value]) => (
            <div key={label} style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>1031 Exchange Packet Builder</div>
          <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
            Stage the execution packet and determine whether the workflow should move to tax,
            legal, title, lender, and qualified intermediary review.
          </div>
          {exchangeChecklist.map((item) => (
            <label key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', lineHeight: 1.55 }}>
              <input type="checkbox" />
              <span>{item}</span>
            </label>
          ))}
        </div>

        <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>Funding & Capital Stack Generator</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Preferred Funding Path</span>
            <select value={fundingPath} onChange={(event) => setFundingPath(event.target.value as FundingPath)} style={inputStyle}>
              <option value="cash">Cash / reserve deployment</option>
              <option value="loan">Loan-backed acquisition</option>
              <option value="seller_finance">Seller finance</option>
              <option value="partner_capital">Partner / investor capital</option>
              <option value="project_funding">Project funding / draw plan</option>
            </select>
          </label>
          <div style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
            {fundingPath === 'loan'
              ? 'Model term sheet, debt service, DSCR, lender conditions, draw controls, and release documentation.'
              : fundingPath === 'seller_finance'
                ? 'Track seller note terms, collateral, cure periods, payoff rights, and recording requirements.'
                : fundingPath === 'partner_capital'
                  ? 'Prepare subscription terms, waterfall, authority, capital calls, and exit documents.'
                  : fundingPath === 'project_funding'
                    ? 'Build scope, budget, draw schedule, lien waiver, inspection, and retainage workflow.'
                    : 'Map reserve use, liquidity floor, treasury approval, and replacement capital plan.'}
          </div>
          <div style={{ color: '#7ef2ff' }}>
            Active entity boards available for packet routing: {activeEntityCount}
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Short-Term Placement & Strategy Training</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {placementOptions.map((option) => (
            <div key={option.label} style={{ borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 800 }}>{option.label}</div>
              <div style={{ color: '#7ef2ff', fontSize: 13 }}>{option.horizon}</div>
              <div style={{ color: '#cbd5e1', lineHeight: 1.55 }}>{option.use}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Trading Bot Strategy Lab</div>
        <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
          Start with education and paper trading. Live execution should only unlock through a
          supported brokerage connection, explicit user authorization, risk limits, and retained audit logs.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Simulation Capital</span>
            <input type="number" value={strategyCapital} onChange={(event) => setStrategyCapital(event.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Max Daily Loss %</span>
            <input type="number" value={maxDailyLoss} onChange={(event) => setMaxDailyLoss(event.target.value)} style={inputStyle} />
          </label>
        </div>
        <div style={{ color: '#facc15', lineHeight: 1.6 }}>
          Suggested guardrail: paper trade up to {currency(asNumber(strategyCapital))} with a daily
          loss stop of {percent(asNumber(maxDailyLoss))}. No income guarantee, no silent live execution.
        </div>
      </section>
    </div>
  );
}
