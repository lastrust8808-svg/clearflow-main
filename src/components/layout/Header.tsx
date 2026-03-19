import React from 'react';

type View =
  | 'home'
  | 'accounting'
  | 'payments'
  | 'reserves'
  | 'entity'
  | 'addEntity'
  | 'fundingRails'
  | 'oidDebtInstrument';

interface HeaderProps {
  view: View;
  entityName?: string;
  savingStatus?: string;
  skin: string;
  onToggleSkin: () => void;
}

const getTitle = (view: View, entityName?: string) => {
  switch (view) {
    case 'home':
      return 'Dashboard';
    case 'accounting':
      return 'Accounting';
    case 'payments':
      return 'Payments';
    case 'reserves':
      return 'Reserves';
    case 'entity':
      return entityName || 'Entity';
    case 'addEntity':
      return 'Add Account';
    case 'fundingRails':
      return 'Funding Rails';
    case 'oidDebtInstrument':
      return 'OID Debt Instruments';
    default:
      return 'Clear Flow';
  }
};

const getSubtitle = (view: View, entityName?: string) => {
  switch (view) {
    case 'home':
      return 'Overview of entities, net worth, records, and operations.';
    case 'accounting':
      return 'Journal activity, accounts, and internal accounting workflow.';
    case 'payments':
      return 'Outgoing payments, transfers, and settlement activity.';
    case 'reserves':
      return 'Reserve positions and supporting asset visibility.';
    case 'entity':
      return entityName ? `Working inside ${entityName}.` : 'Entity detail view.';
    case 'addEntity':
      return 'Register a new entity or personal account.';
    case 'fundingRails':
      return 'Settlement rails and connected movement workflows.';
    case 'oidDebtInstrument':
      return 'Create and review debt instruments for ledger treatment.';
    default:
      return 'Clear Flow workspace.';
  }
};

export const Header: React.FC<HeaderProps> = ({
  view,
  entityName,
  savingStatus,
  skin,
  onToggleSkin,
}) => {
  const title = getTitle(view, entityName);
  const subtitle = getSubtitle(view, entityName);

  return (
    <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-white truncate">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-2xl">
              {subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs sm:text-sm text-slate-300">
              Save Status:{' '}
              <span className="font-semibold text-white">
                {savingStatus || 'idle'}
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleSkin}
              className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Theme: {skin === 'light' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};