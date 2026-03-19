import React, { useState, useMemo } from 'react';
import { Wand2, CheckCircle2, Clock, AlertCircle, Play, XCircle } from 'lucide-react';
import { Entity, WizardType, WizardSession } from '../../types/app.models';

interface Props {
  entity: Entity;
  onUpdate: (entity: Entity) => void;
  onClose: () => void;
}

const wizardOptions: { type: WizardType; label: string; description: string }[] = [
  { type: 'DTCC', label: 'DTCC Settlement', description: 'Automate securities settlement and clearing via DTCC protocols.' },
  { type: 'EXCHANGE', label: 'Asset Exchange', description: 'Facilitate 1031 or similar asset exchanges with automated escrow.' },
  { type: 'REAL_ESTATE', label: 'Real Estate Closing', description: 'End-to-end digital closing for real property transactions.' },
  { type: 'COLLATERAL', label: 'Collateral Management', description: 'Register and monitor collateral for secured lending facilities.' },
  { type: 'FORENSIC', label: 'Forensic Audit', description: 'AI-driven deep dive into ledger history for compliance or investigation.' },
  { type: 'SETTLEMENT', label: 'Legal Settlement', description: 'Manage distribution of funds and release of claims for legal settlements.' },
  { type: 'LEGAL', label: 'Entity Governance', description: 'Generate and maintain corporate resolutions and legal standing.' },
  { type: 'RESITUS', label: 'Asset Re-Situs', description: 'Relocate asset legal jurisdiction for tax or regulatory optimization.' },
  { type: 'RESOLUTION', label: 'Corporate Resolution', description: 'Draft and execute formal board or member resolutions.' },
  { type: 'CREDIT_DEFENSE', label: 'Credit Defense', description: 'Automated response and resolution for credit disputes or claims.' },
  { type: 'CHANCERY', label: 'Chancery Filing', description: 'Prepare and file documents for equitable relief or trust matters.' },
  { type: '1099', label: 'Tax Reporting (1099)', description: 'Generate and file 1099 forms for contractors and payees.' },
  { type: 'ACCOUNT_RECON', label: 'Account Reconciliation', description: 'Automated multi-source ledger to bank statement reconciliation.' },
  { type: 'EDGAR', label: 'SEC EDGAR Filing', description: 'Prepare and submit required filings to the SEC EDGAR system.' },
  { type: 'MARAD', label: 'Maritime Registry', description: 'Register and manage maritime assets with MARAD compliance.' },
];

export const WizardWidget: React.FC<Props> = ({ entity, onUpdate, onClose }) => {
  const [selectedWizard, setSelectedWizard] = useState<WizardType | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const sessions = useMemo(() => entity.wizardSessions || [], [entity.wizardSessions]);

  const handleStartWizard = async (type: WizardType) => {
    setIsStarting(true);
    // Simulate API call to start a workflow
    await new Promise(resolve => setTimeout(resolve, 1500));

    const newSession: WizardSession = {
      id: crypto.randomUUID(),
      entityId: entity.id,
      type: type,
      status: 'active',
      startedAt: new Date().toISOString(),
      data: {}
    };

    onUpdate({
      ...entity,
      wizardSessions: [newSession, ...sessions]
    });

    setIsStarting(false);
    setSelectedWizard(null);
  };

  const getStatusIcon = (status: WizardSession['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-emerald-500" size={16} />;
      case 'active': return <Clock className="text-amber-500 animate-pulse" size={16} />;
      case 'failed': return <AlertCircle className="text-red-500" size={16} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-200">
      <div className="flex-shrink-0 p-6 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="text-purple-400" />
            Workflow Wizards
          </h2>
          <p className="text-sm text-slate-400 mt-1">Automated legal and financial operational workflows.</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <XCircle size={24} className="text-slate-500" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Left: Wizard Selection */}
        <div className="w-1/2 border-r border-slate-800 overflow-y-auto p-6 custom-scrollbar">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Available Workflows</h3>
          <div className="grid grid-cols-1 gap-3">
            {wizardOptions.map((opt) => (
              <button
                key={opt.type}
                onClick={() => setSelectedWizard(opt.type)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedWizard === opt.type 
                    ? 'border-purple-500 bg-purple-500/10' 
                    : 'border-slate-700 bg-slate-800/30 hover:border-slate-500'
                }`}
              >
                <div className="font-bold text-slate-100">{opt.label}</div>
                <div className="text-xs text-slate-400 mt-1">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Active Sessions & Details */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {selectedWizard ? (
              <div className="animate-fade-in">
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 mb-8">
                  <h3 className="text-xl font-bold text-purple-100 mb-2">
                    {wizardOptions.find(o => o.type === selectedWizard)?.label}
                  </h3>
                  <p className="text-sm text-purple-200/70 mb-6">
                    {wizardOptions.find(o => o.type === selectedWizard)?.description}
                  </p>
                  <button
                    onClick={() => handleStartWizard(selectedWizard)}
                    disabled={isStarting}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isStarting ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <Play size={18} />
                        Initiate Workflow
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-8">
                <Wand2 size={48} className="mb-4 opacity-20" />
                <p>Select a wizard to begin an automated workflow.</p>
              </div>
            )}

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Session History</h3>
              <div className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl text-slate-600 text-sm">
                    No active or past sessions.
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div key={session.id} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(session.status)}
                        <div>
                          <div className="font-bold text-sm text-slate-200">{session.type}</div>
                          <div className="text-[10px] text-slate-500">{new Date(session.startedAt).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-slate-900 text-slate-400">
                        {session.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
