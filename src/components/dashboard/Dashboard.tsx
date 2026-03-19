import React, { useMemo, useState, useEffect } from 'react';
import { Entity, SystemStatus } from '../../types/app.models';
import { EntityCard } from '../entity-card/EntityCard';
import { SystemStatusCard } from '../system-status-card/SystemStatusCard';
import { systemHealthService, SystemHealthAnalysis } from '../../services/system-health.service';

type View = 'home' | 'accounting' | 'reserves' | 'entity' | 'addEntity' | 'governanceDocs' | 'governanceQA';

interface DashboardProps {
  entities: Entity[];
  onNavigate: (view: View, entityId?: string) => void;
  onDeleteEntity: (entity: Entity) => void;
  onQuickAdd: () => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const SummaryCard: React.FC<{ title: string; value: string; details: string; icon: React.ReactNode; }> = ({ title, value, details, icon }) => (
  <div className="bg-slate-800/50 p-5 rounded-lg border border-slate-700 flex items-center gap-4">
    <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-slate-700/50 rounded-lg text-blue-400">
      {icon}
    </div>
    <div>
      <h3 className="text-sm font-medium text-slate-400">{title}</h3>
      <p className="text-2xl font-semibold text-slate-100 mt-1">{value}</p>
      <p className="text-xs text-slate-500 mt-2">{details}</p>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ entities, onNavigate, onDeleteEntity, onQuickAdd }) => {
  const [systemStatuses, setSystemStatuses] = useState<SystemStatus[]>([]);
  const [healthAnalysis, setHealthAnalysis] = useState<SystemHealthAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    systemHealthService.getSystemStatus().then(setSystemStatuses);
  }, []);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const analysis = await systemHealthService.getHealthAnalysis();
      setHealthAnalysis(analysis);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const stats = useMemo(() => {
    const today = new Date();
    return entities.reduce((acc, entity) => {
      acc.totalReserves += (entity.reserves || []).reduce((sum, r) => sum + r.currentBalance, 0);
      acc.activeCredit += (entity.loans || []).filter(l => l.status === 'active').reduce((sum, l) => sum + l.principal, 0);
      const overdue = (entity.invoices || []).filter(i => i.status === 'overdue' || (i.status !== 'paid' && new Date(i.dueDate) < today));
      acc.overdueInvoices += overdue.reduce((sum, i) => sum + i.amount, 0);
      const upcoming = (entity.bills || []).filter(b => b.status === 'unpaid' && new Date(b.dueDate) > today);
      acc.upcomingBills += upcoming.reduce((sum, b) => sum + b.amount, 0);
      return acc;
    }, { totalReserves: 0, activeCredit: 0, overdueInvoices: 0, upcomingBills: 0 });
  }, [entities]);

  const actionItems = useMemo(() => {
    return entities.filter(e => e.type !== 'Personal' && !e.isVerified);
  }, [entities]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-slate-300 mb-4">Financial Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <SummaryCard title="Total Reserves" value={currencyFormatter.format(stats.totalReserves)} details="Across all entities" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>} />
              <SummaryCard title="Active Credit" value={currencyFormatter.format(stats.activeCredit)} details="Principal on active loans" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
              <SummaryCard title="Overdue Invoices" value={currencyFormatter.format(stats.overdueInvoices)} details="Receivables past due" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
              <SummaryCard title="Upcoming Bills" value={currencyFormatter.format(stats.upcomingBills)} details="Payables due soon" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-300 mb-3">Action Items</h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 space-y-3">
              {actionItems.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">No urgent actions required.</p> : (
                actionItems.map(entity => (
                  <div key={entity.id} className="p-3 bg-amber-900/20 rounded-md border border-amber-500/30">
                    <p className="font-semibold text-amber-300 text-sm">Verify Entity</p>
                    <p className="text-xs text-slate-400">"{entity.name}" requires verification to access all features.</p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-300 mb-3">Quick Actions</h3>
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 space-y-3">
              <button 
                onClick={onQuickAdd} 
                className="w-full flex items-center justify-center gap-2 text-center px-4 py-2 bg-blue-600/80 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors text-sm disabled:bg-slate-600 disabled:cursor-not-allowed" 
                disabled={entities.length === 0}
                title={entities.length === 0 ? "Add an entity first" : "Add a new transaction"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add Transaction
              </button>
              <button className="w-full text-center px-4 py-2 bg-slate-700/80 text-white font-semibold rounded-md text-sm disabled:opacity-50" disabled>+ Add Invoice</button>
              <button className="w-full text-center px-4 py-2 bg-slate-700/80 text-white font-semibold rounded-md text-sm disabled:opacity-50" disabled>+ Add Bill</button>
            </div>
          </div>
        </div>
      </div>
      
      <div>
         <div className="flex items-center justify-between mb-4">
           <h3 className="text-xl font-semibold text-slate-300">System Status</h3>
           <button 
             onClick={runAnalysis} 
             disabled={isAnalyzing}
             className="text-xs px-3 py-1 bg-blue-600/50 hover:bg-blue-600 text-blue-100 rounded border border-blue-500/30 transition-colors disabled:opacity-50"
           >
             {isAnalyzing ? 'Analyzing...' : 'Run AI Health Check'}
           </button>
         </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {systemStatuses.map(status => <SystemStatusCard key={status.serviceName} status={status} />)}
          </div>

          {healthAnalysis && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-slate-200">AI Health Analysis</h4>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Health Score:</span>
                  <span className={`text-xl font-bold ${healthAnalysis.overallScore > 80 ? 'text-emerald-400' : healthAnalysis.overallScore > 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {healthAnalysis.overallScore}/100
                  </span>
                </div>
              </div>
              
              <p className="text-slate-300 mb-6">{healthAnalysis.summary}</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Recommendations</h5>
                  <div className="space-y-3">
                    {healthAnalysis.recommendations.map((rec, idx) => (
                      <div key={idx} className="flex gap-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                          rec.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                          rec.severity === 'high' ? 'bg-orange-500' :
                          rec.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{rec.service}</p>
                          <p className="text-xs text-slate-400 mt-1">{rec.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h5 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Business Impact</h5>
                  <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                    <p className="text-sm text-blue-200 leading-relaxed italic">
                      "{healthAnalysis.businessImpact}"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>

      <div>
        <h3 className="text-xl font-semibold text-slate-300 mb-4">Entities & Accounts</h3>
        {entities.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-700 rounded-lg bg-slate-800/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-slate-300">Create your first account</h3>
            <p className="text-slate-500 mt-1 text-sm">Get started by adding a business entity or personal account.</p>
            <button onClick={() => onNavigate('addEntity')} className="mt-6 px-5 py-2 btn btn-primary">
              Add New Account
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entities.map(entity => (
              <EntityCard 
                key={entity.id} 
                entity={entity} 
                onViewDetail={() => onNavigate('entity', entity.id)} 
                onDelete={onDeleteEntity} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};