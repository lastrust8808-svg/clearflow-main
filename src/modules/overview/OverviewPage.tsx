import React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, Coins, FileText, Landmark, ShieldCheck } from 'lucide-react';
import type { DashboardSummary } from '../../types/core';

interface OverviewPageProps {
  dashboardSummary: DashboardSummary;
  entities?: Array<{ id: string; name: string; entityType: string; status: string }>;
  assets?: Array<{ id: string; name: string; assetClass: string; marketValue?: number; liquidationValue?: number; immediateCashValue?: number; status: string }>;
  complianceItems?: Array<{ id: string; title: string; dueDate: string; status: string }>;
  generatedReportingPackets?: Array<{ id: string; title: string; formType: string; filingStatus: string }>;
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}> = ({ title, value, subtitle, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="text-slate-500">{icon}</div>
    </div>
    <div className="text-2xl font-semibold text-slate-900">{value}</div>
    <div className="mt-2 text-xs text-slate-500">{subtitle}</div>
  </div>
);

const SectionCard: React.FC<{
  title: string;
  children: React.ReactNode;
  rightLabel?: string;
}> = ({ title, children, rightLabel }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {rightLabel ? <span className="text-xs text-slate-500">{rightLabel}</span> : null}
    </div>
    {children}
  </div>
);

const badgeClasses: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  posted: 'bg-emerald-100 text-emerald-700',
  ok: 'bg-emerald-100 text-emerald-700',
  upcoming: 'bg-amber-100 text-amber-700',
  review_required: 'bg-amber-100 text-amber-700',
  draft_generated: 'bg-sky-100 text-sky-700',
  overdue: 'bg-rose-100 text-rose-700',
  blocked: 'bg-rose-100 text-rose-700',
  pending: 'bg-slate-100 text-slate-700',
};

function getBadgeClass(status: string) {
  return badgeClasses[status] ?? 'bg-slate-100 text-slate-700';
}

const OverviewPage: React.FC<OverviewPageProps> = ({
  dashboardSummary,
  entities = [],
  assets = [],
  complianceItems = [],
  generatedReportingPackets = [],
}) => {
  const topAssets = [...assets]
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, 5);

  const priorityCompliance = [...complianceItems]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const recentPackets = generatedReportingPackets.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-300">ClearFlow Core OS</div>
        <h1 className="mt-2 text-3xl font-semibold">Wealth, compliance, and transaction control in one place.</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          This overview is your command layer for assets, liquidation value, cash position, obligations, entity records,
          and draft reporting packets.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Cash"
          value={money(dashboardSummary.totalCash)}
          subtitle="Immediately available cash position"
          icon={<Landmark size={18} />}
        />
        <StatCard
          title="Total Assets"
          value={money(dashboardSummary.totalAssets)}
          subtitle="Estimated value across recorded assets"
          icon={<Building2 size={18} />}
        />
        <StatCard
          title="Liquidation Value"
          value={money(dashboardSummary.totalLiquidationValue)}
          subtitle="Estimated realistic sale / disposition value"
          icon={<Coins size={18} />}
        />
        <StatCard
          title="Immediate Cash Value"
          value={money(dashboardSummary.totalImmediateCashValue)}
          subtitle="Estimated accessible cash at near-term conversion"
          icon={<ShieldCheck size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <StatCard
          title="Monthly Inflow"
          value={money(dashboardSummary.monthlyInflow)}
          subtitle="Cash or equivalent received this cycle"
          icon={<ArrowUpRight size={18} />}
        />
        <StatCard
          title="Monthly Outflow"
          value={money(dashboardSummary.monthlyOutflow)}
          subtitle="Cash or equivalent paid this cycle"
          icon={<ArrowDownRight size={18} />}
        />
        <StatCard
          title="Overdue Items"
          value={String(dashboardSummary.overdueItems)}
          subtitle="Compliance or workflow items requiring attention"
          icon={<AlertTriangle size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard title="Entity Snapshot" rightLabel={`${entities.length} total`}>
          <div className="space-y-3">
            {entities.length === 0 ? (
              <div className="text-sm text-slate-500">No entities loaded.</div>
            ) : (
              entities.map((entity) => (
                <div key={entity.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="font-medium text-slate-900">{entity.name}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {entity.entityType} · {entity.status}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeClass(entity.status)}`}>
                    {entity.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Top Asset Values" rightLabel="By market value">
          <div className="space-y-3">
            {topAssets.length === 0 ? (
              <div className="text-sm text-slate-500">No assets loaded.</div>
            ) : (
              topAssets.map((asset) => (
                <div key={asset.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{asset.name}</div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">{asset.assetClass}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeClass(asset.status)}`}>
                      {asset.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div>
                      <div className="text-slate-400">Market</div>
                      <div className="font-medium text-slate-900">{money(asset.marketValue ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Liquidation</div>
                      <div className="font-medium text-slate-900">{money(asset.liquidationValue ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Cash Now</div>
                      <div className="font-medium text-slate-900">{money(asset.immediateCashValue ?? 0)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Draft Reporting Packets" rightLabel="Generated workflow output">
          <div className="space-y-3">
            {recentPackets.length === 0 ? (
              <div className="text-sm text-slate-500">No generated packets yet.</div>
            ) : (
              recentPackets.map((packet) => (
                <div key={packet.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{packet.title}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">{packet.formType}</div>
                  </div>
                  <span className={`ml-3 rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeClass(packet.filingStatus)}`}>
                    {packet.filingStatus}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Upcoming Compliance">
          <div className="space-y-3">
            {priorityCompliance.length === 0 ? (
              <div className="text-sm text-slate-500">No compliance items loaded.</div>
            ) : (
              priorityCompliance.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="font-medium text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500">Due {item.dueDate}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="System Priorities" rightLabel="Suggested next actions">
          <div className="space-y-3 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 p-3">
              Verify transaction-to-form rules for closings, interest payments, collateral postings, and beneficiary distributions.
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              Expand asset records with linked supporting documents, counterparty data, and verified valuation memos.
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              Add approval actions for generated 1099, K-1, and UCC packet drafts before marking them ready for filing.
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              Connect the next module views so users can move from overview into assets, transactions, and reporting workflows.
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <FileText size={18} className="text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Operating Note</h2>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          This overview is designed as a control surface. It should unify entity structure, liquidation-aware asset values,
          transaction tracking, reporting packet generation, and compliance review before any form or filing is treated as verified.
        </p>
      </div>
    </div>
  );
};

export default OverviewPage;
