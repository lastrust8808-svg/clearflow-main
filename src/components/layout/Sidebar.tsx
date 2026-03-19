import React from 'react';
import { Entity, User } from '../../types/app.models';
import { Logo } from '../logo/Logo';

type View =
  | 'home'
  | 'accounting'
  | 'payments'
  | 'reserves'
  | 'entity'
  | 'addEntity'
  | 'fundingRails'
  | 'oidDebtInstrument';

interface SidebarProps {
  onNavigate: (view: View, entityId?: string) => void;
  entities: Entity[];
  onAddEntity: () => void;
  onLogout: () => void;
  currentUser: User | null;
  currentView: View;
  activeEntityId: string | null;
}

const NavButton: React.FC<{
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
}> = ({ onClick, isActive, children }) => {
  const baseClasses =
    'w-full text-left flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors';
  const activeClasses = 'bg-slate-700 text-white border border-slate-600';
  const inactiveClasses =
    'text-slate-300 hover:bg-slate-700/50 hover:text-white border border-transparent';

  return (
    <button onClick={onClick} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}>
      {children}
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  onNavigate,
  entities,
  onAddEntity,
  onLogout,
  currentUser,
  currentView,
  activeEntityId,
}) => {
  return (
    <aside className="h-full w-72 max-w-[82vw] bg-slate-800/90 border-r border-slate-700 flex flex-col flex-shrink-0 backdrop-blur">
      <div className="h-20 flex items-center px-5 border-b border-slate-700">
        <Logo height={35} />
      </div>

      <nav className="flex-1 px-4 py-4 space-y-5 overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          <h3 className="px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
            Main
          </h3>

          <NavButton onClick={() => onNavigate('home')} isActive={currentView === 'home'}>
            Home
          </NavButton>

          <NavButton onClick={() => onNavigate('accounting')} isActive={currentView === 'accounting'}>
            Accounting
          </NavButton>

          <NavButton onClick={() => onNavigate('payments')} isActive={currentView === 'payments'}>
            Payments
          </NavButton>

          <NavButton onClick={() => onNavigate('reserves')} isActive={currentView === 'reserves'}>
            Reserves
          </NavButton>
        </div>

        <div className="space-y-2">
          <h3 className="px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
            Tools
          </h3>

          <NavButton
            onClick={() => onNavigate('fundingRails')}
            isActive={currentView === 'fundingRails'}
          >
            Funding Rails
          </NavButton>

          <NavButton
            onClick={() => onNavigate('oidDebtInstrument')}
            isActive={currentView === 'oidDebtInstrument'}
          >
            OID Debt Instruments
          </NavButton>
        </div>

        <div className="space-y-2">
          <h3 className="px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em]">
            Entities
          </h3>

          {entities.length === 0 ? (
            <div className="px-3 py-3 rounded-xl border border-dashed border-slate-700 text-sm text-slate-400">
              No entities yet
            </div>
          ) : (
            entities.map((entity) => (
              <NavButton
                key={entity.id}
                onClick={() => onNavigate('entity', entity.id)}
                isActive={currentView === 'entity' && activeEntityId === entity.id}
              >
                <span className="truncate">{entity.name}</span>
              </NavButton>
            ))
          )}

          <button
            onClick={onAddEntity}
            className="w-full text-left flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-cyan-300 hover:bg-slate-700/50 hover:text-cyan-200 transition-colors border border-dashed border-slate-600"
          >
            + Add New Account
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-700 bg-slate-900/30">
        <div className="px-2">
          <p className="text-sm font-medium text-slate-200 truncate">{currentUser?.name}</p>
          <p className="text-xs text-slate-400 truncate">{currentUser?.email}</p>
        </div>

        <button
          onClick={onLogout}
          className="w-full mt-4 text-center px-3 py-2.5 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-colors text-sm"
        >
          Logout
        </button>
      </div>
    </aside>
  );
};