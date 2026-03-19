import React from 'react';
import { Entity } from '../../types/app.models';

type View = 'home' | 'accounting' | 'reserves' | 'entity' | 'addEntity' | 'governanceDocs' | 'governanceQA';

interface AccountingDashboardProps {
  entities: Entity[];
  onNavigate: (view: View, entityId?: string) => void;
}

export const AccountingDashboard: React.FC<AccountingDashboardProps> = ({ entities, onNavigate }) => {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-slate-400 text-sm mb-6 max-w-3xl">This is the central hub for all accounting activities, including Chart of Accounts, Journal Entries, and Reconciliation. Select an entity below to manage its financial records.</p>
        
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">Select an Entity or Account</h3>
          {entities.length === 0 ? (
             <div className="text-center py-10">
                <p className="text-slate-500">No entities or accounts found.</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {entities.map(entity => (
                <button 
                  key={entity.id} 
                  onClick={() => onNavigate('entity', entity.id)}
                  className="p-4 bg-slate-900/70 border border-slate-700 rounded-md text-left hover:bg-slate-700/50 hover:border-blue-500 transition-colors"
                >
                  <p className="font-semibold text-slate-200">{entity.name}</p>
                  <p className="text-xs text-slate-400">{entity.type}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};