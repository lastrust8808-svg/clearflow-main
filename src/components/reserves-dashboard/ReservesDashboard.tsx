import React, { useState, useMemo, useEffect } from 'react';
import { Entity, ReserveAccount, Loan, PlannedAsset, AssetCategory } from '../../types/app.models';
import { useAuth } from '../../hooks/useAuth';
import { geminiService } from '../../services/gemini.service';

interface ReservesDashboardProps {
  entities: Entity[];
  onUpdateEntity: (entity: Entity) => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Moved outside component to prevent re-creation on every render
const initialAssetFormState = { entityId: '', name: '', category: 'Real Estate' as AssetCategory, type: '', estimatedValue: 0, description: '', linkedReserveId: '' };
const assetCategories: AssetCategory[] = ["Real Estate", "Financial", "Business", "Personal", "Digital", "Other"];

export const ReservesDashboard: React.FC<ReservesDashboardProps> = ({ entities, onUpdateEntity }) => {
  const auth = useAuth();
  const [loanModalData, setLoanModalData] = useState<{ entity: Entity, reserve: ReserveAccount } | null>(null);
  const [loanForm, setLoanForm] = useState({ borrower: '', principal: 0, interestRate: 5 });
  
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [repaymentForm, setRepaymentForm] = useState({ loanId: '', amount: '' as string | number });

  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetForm, setAssetForm] = useState(initialAssetFormState);
  
  // Onboarding States
  const [onboardingEntityId, setOnboardingEntityId] = useState<string>('');
  const [stateRegNumber, setStateRegNumber] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  useEffect(() => {
    const firstLockedEntity = entities.find(e => e.reserveStatus !== 'active');
    if (firstLockedEntity && !onboardingEntityId) {
      setOnboardingEntityId(firstLockedEntity.id);
    }
  }, [entities, onboardingEntityId]);

  const activeEntities = useMemo(() => entities.filter(e => e.reserveStatus === 'active'), [entities]);
  const hasActiveReserves = activeEntities.length > 0;

  const allReserves = useMemo(() => {
    return activeEntities.flatMap(entity => 
      (entity.reserves || []).map(reserve => ({ ...reserve, entityName: entity.name, entityId: entity.id }))
    );
  }, [activeEntities]);
  
  const allActiveLoans = useMemo(() => {
    return activeEntities.flatMap(entity => 
      (entity.loans || []).filter(loan => loan.status === 'active').map(loan => ({ ...loan, entityName: entity.name, entityId: entity.id }))
    );
  }, [activeEntities]);

  const allPlannedAssets = useMemo(() => {
    return activeEntities.flatMap(entity => 
      (entity.plannedAssets || []).map(asset => ({ ...asset, entityName: entity.name, entityId: entity.id }))
    );
  }, [activeEntities]);

  useEffect(() => {
    if (repaymentForm.loanId) {
        const selectedLoan = allActiveLoans.find(l => l.id === repaymentForm.loanId);
        if (selectedLoan && repaymentForm.amount === '') {
            setRepaymentForm(f => ({ ...f, amount: selectedLoan.principal }));
        }
    }
  }, [repaymentForm.loanId, allActiveLoans, repaymentForm.amount]);

  const handleIssueLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanModalData) return;

    const { entity, reserve } = loanModalData;
    const principal = Number(loanForm.principal);

    if (principal <= 0 || principal > reserve.currentBalance) {
      alert('Loan principal must be greater than zero and cannot exceed the reserve balance.');
      return;
    }

    const newLoan: Loan = { id: crypto.randomUUID(), borrower: loanForm.borrower, principal, interestRate: Number(loanForm.interestRate), issueDate: new Date().toISOString().split('T')[0], status: 'active', sourceReserveId: reserve.id };
    const updatedEntity: Entity = {
      ...entity,
      reserves: (entity.reserves || []).map(r => r.id === reserve.id ? { ...r, currentBalance: r.currentBalance - principal } : r),
      loans: [...(entity.loans || []), newLoan],
      journal: [ ...(entity.journal || []), { id: crypto.randomUUID(), date: newLoan.issueDate, description: `Loan issued to ${newLoan.borrower}`, lines: [{ account: 'Loan Receivable', debit: principal, credit: 0 }, { account: 'Cash', debit: 0, credit: principal }] }]
    };

    onUpdateEntity(updatedEntity);
    setLoanModalData(null);
    setLoanForm({ borrower: '', principal: 0, interestRate: 5 });
  };
  
  const handleRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    const { loanId, amount } = repaymentForm;
    const repaymentAmount = Number(amount);
    
    const loanToRepay = allActiveLoans.find(l => l.id === loanId);
    if (!loanToRepay) { alert('Selected loan not found.'); return; }
    if (repaymentAmount < loanToRepay.principal) { alert('Repayment amount cannot be less than the principal.'); return; }
    
    const entityToUpdate = entities.find(e => e.id === loanToRepay.entityId);
    if (!entityToUpdate) return;
    
    const interestIncome = repaymentAmount - loanToRepay.principal;
    const updatedEntity: Entity = {
      ...entityToUpdate,
      loans: (entityToUpdate.loans || []).map(l => l.id === loanId ? { ...l, status: 'paid' } : l),
      reserves: (entityToUpdate.reserves || []).map(r => r.id === loanToRepay.sourceReserveId ? { ...r, currentBalance: r.currentBalance + repaymentAmount } : r),
      journal: [ ...(entityToUpdate.journal || []), { id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], description: `Loan repayment from ${loanToRepay.borrower}`, lines: [ { account: 'Cash', debit: repaymentAmount, credit: 0 }, { account: 'Loan Receivable', debit: 0, credit: loanToRepay.principal }, ...(interestIncome > 0 ? [{ account: 'Interest Income', debit: 0, credit: interestIncome }] : [])]}]
    };

    onUpdateEntity(updatedEntity);
    setIsRepaymentModalOpen(false);
    setRepaymentForm({ loanId: '', amount: '' });
  };
  
  const handleSavePlannedAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetForm.entityId || !assetForm.name || !assetForm.type) return;

    const targetEntity = entities.find(e => e.id === assetForm.entityId);
    if (!targetEntity) return;

    const newAsset: PlannedAsset = { id: crypto.randomUUID(), name: assetForm.name, category: assetForm.category, type: assetForm.type, estimatedValue: Number(assetForm.estimatedValue), description: assetForm.description, linkedReserveId: assetForm.linkedReserveId || undefined };
    const updatedEntity: Entity = { ...targetEntity, plannedAssets: [...(targetEntity.plannedAssets || []), newAsset] };

    onUpdateEntity(updatedEntity);
    setIsAssetModalOpen(false);
    setAssetForm(initialAssetFormState);
  };

  const handleReserveActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingEntityId || !stateRegNumber || !certFile || !idFile || !auth.currentUser) return;
    
    setIsVerifying(true);
    setVerificationError(null);

    const entityToActivate = entities.find(e => e.id === onboardingEntityId);
    if (!entityToActivate) { setVerificationError("Selected entity not found."); setIsVerifying(false); return; }

    try {
        if (!geminiService.isConfigured) {
            await new Promise(r => setTimeout(r, 2000));
        } else {
            const [idResult, certResult] = await Promise.all([ geminiService.analyzeIdDocument(idFile), geminiService.analyzeDocument(certFile) ]);
            const idName = idResult.fullName.trim().toLowerCase();
            const userName = auth.currentUser.name.trim().toLowerCase();
            const certEntityName = certResult.entityName.trim().toLowerCase();
            const entityName = entityToActivate.name.trim().toLowerCase();

            if (!userName.split(' ').every(part => idName.includes(part))) throw new Error(`Name on ID (${idResult.fullName}) does not appear to match your registered name (${auth.currentUser.name}).`);
            if (!certEntityName.includes(entityName)) throw new Error(`Entity name on certificate (${certResult.entityName}) does not appear to match the selected entity (${entityToActivate.name}).`);
            if (certResult.ein && certResult.ein.replace(/\D/g, '') !== entityToActivate.ein.replace(/\D/g, '')) throw new Error(`EIN on certificate (${certResult.ein}) does not match the entity's EIN.`);
        }
        
        const updatedEntity: Entity = { ...entityToActivate, stateRegistrationNumber: stateRegNumber, reserveStatus: 'active' };
        onUpdateEntity(updatedEntity);
    } catch (err) {
        setVerificationError(err instanceof Error ? err.message : 'An unknown verification error occurred.');
    } finally {
        setIsVerifying(false);
    }
  };
  
  const renderOnboarding = () => {
    if (entities.length === 0) {
      return (
        <div className="text-center py-16 border-2 border-dashed border-slate-700 rounded-lg">
          <h3 className="text-lg text-slate-400">Create an Entity to Activate Reserves</h3>
          <p className="text-slate-500 mt-1 text-sm">You must first register an entity on the main dashboard.</p>
        </div>
      );
    }
    const entityToActivate = entities.find(e => e.id === onboardingEntityId);
    return (
        <div className="bg-slate-800/50 p-8 rounded-lg border border-slate-700 max-w-4xl mx-auto">
          <h2 className="text-3xl font-semibold mb-1 text-white">Activate Capital Reserves</h2>
          <p className="text-slate-400 mb-6">To comply with financial regulations and enable private reserve features, please provide verification details for an entity.</p>
          <form onSubmit={handleReserveActivation}>
            <fieldset className="border-t border-slate-600 pt-6">
                <legend className="text-lg font-medium text-blue-400">Entity Details</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Entity to Activate</label>
                        <select value={onboardingEntityId} onChange={e => setOnboardingEntityId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2">
                           {entities.filter(e => e.reserveStatus !== 'active').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">EIN (for confirmation)</label>
                        <input type="text" value={entityToActivate?.ein || ''} readOnly className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-500" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-400 mb-1">State Registration Number</label>
                        <input type="text" value={stateRegNumber} onChange={e => setStateRegNumber(e.target.value)} required className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" />
                    </div>
                </div>
            </fieldset>

            <fieldset className="border-t border-slate-600 pt-6 mt-8">
              <legend className="text-lg font-medium text-blue-400">Required Documents</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                  <h4 className="font-semibold text-slate-300">Certificate of Existence</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-2">Upload the entity's formation document.</p>
                  <div className="p-3 bg-slate-800 rounded-md border-2 border-dashed border-slate-600 text-center">
                    <input id="cert-upload" type="file" onChange={e => setCertFile(e.target.files?.[0] || null)} accept="image/*, application/pdf" className="hidden" />
                    <label htmlFor="cert-upload" className="cursor-pointer text-sm text-blue-400 font-semibold hover:text-blue-300">{certFile ? certFile.name : 'Select Document'}</label>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-300">Owner's ID</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-2">Upload a government-issued photo ID.</p>
                  <div className="p-3 bg-slate-800 rounded-md border-2 border-dashed border-slate-600 text-center">
                    <input id="id-upload" type="file" onChange={e => setIdFile(e.target.files?.[0] || null)} accept="image/*, application/pdf" className="hidden" />
                    <label htmlFor="id-upload" className="cursor-pointer text-sm text-blue-400 font-semibold hover:text-blue-300">{idFile ? idFile.name : 'Select Document'}</label>
                  </div>
                </div>
              </div>
            </fieldset>

            {verificationError && <div className="mt-6 rounded-md p-3 bg-red-900/40 border border-red-500/30 text-red-300 text-sm"><p className="font-semibold">Verification Error</p><p>{verificationError}</p></div>}
            <div className="flex justify-end gap-4 mt-10 border-t border-slate-700 pt-6">
                <button type="submit" disabled={isVerifying || !onboardingEntityId || !stateRegNumber || !certFile || !idFile} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 disabled:cursor-not-allowed rounded-md">{isVerifying ? 'Verifying...' : 'Submit for Verification'}</button>
            </div>
          </form>
        </div>
    );
  };

  if (!hasActiveReserves) {
    return renderOnboarding();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-slate-400 text-sm max-w-3xl">Manage capital reserves and private lending activities across all your entities from this centralized dashboard.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { setRepaymentForm({ loanId: allActiveLoans[0]?.id || '', amount: '' }); setIsRepaymentModalOpen(true); }} disabled={allActiveLoans.length === 0} className="px-5 py-2 bg-purple-600 text-white font-semibold rounded-md text-sm hover:bg-purple-700 whitespace-nowrap disabled:bg-slate-500 disabled:cursor-not-allowed">+ Liquidate Credit</button>
          <button onClick={() => { setAssetForm({...initialAssetFormState, entityId: activeEntities[0]?.id || '' }); setIsAssetModalOpen(true); }} disabled={activeEntities.length === 0} className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-md text-sm hover:bg-emerald-700 whitespace-nowrap disabled:bg-slate-500 disabled:cursor-not-allowed">+ Add Asset to Plan</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allReserves.map(reserve => {
           const progress = reserve.targetAmount > 0 ? (reserve.currentBalance / reserve.targetAmount) * 100 : 0;
           return (
            <div key={`${reserve.entityId}-${reserve.id}`} className="bg-slate-800/50 p-5 rounded-lg border border-slate-700 flex flex-col">
              <div className="flex-grow">
                <div className="flex justify-between items-start"><h4 className="font-semibold text-slate-200">{reserve.name}</h4><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{reserve.category}</span></div>
                <p className="text-xs text-blue-400 font-medium">{reserve.entityName}</p>
                <p className="text-sm text-slate-400 mt-2">{reserve.purpose}</p>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{currencyFormatter.format(reserve.currentBalance)}</span><span>Target: {currencyFormatter.format(reserve.targetAmount)}</span></div>
                  <div className="w-full bg-slate-700 rounded-full h-2.5"><div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }}></div></div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                {reserve.category === 'Lending Pool' && (<button onClick={() => { const entity = entities.find(e => e.id === reserve.entityId); if (entity) setLoanModalData({ entity, reserve }); }} disabled={reserve.currentBalance <= 0} className="w-full px-4 py-2 bg-purple-600 text-white font-semibold rounded-md text-sm hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed">Issue Loan</button>)}
              </div>
            </div>
           );
        })}
      </div>

      <div className="mt-12">
        <h3 className="text-xl font-semibold text-slate-300 mb-4">Active Loans</h3>
        {allActiveLoans.length === 0 ? (<div className="text-center py-16 border-2 border-dashed border-slate-700 rounded-lg"><h3 className="text-lg text-slate-400">No active loans found.</h3><p className="text-slate-500 mt-1 text-sm">Loans issued from 'Lending Pool' reserves will appear here.</p></div>
        ) : (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-x-auto">
             <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-600"><th className="text-left p-3 font-semibold">Borrower</th><th className="text-left p-3 font-semibold">Entity</th><th className="text-right p-3 font-semibold">Principal</th><th className="text-right p-3 font-semibold">Interest Rate</th><th className="text-left p-3 font-semibold">Issue Date</th></tr></thead>
                <tbody>{allActiveLoans.map(loan => (<tr key={loan.id} className="border-b border-slate-800"><td className="p-3 font-medium">{loan.borrower}</td><td className="p-3 text-slate-400">{loan.entityName}</td><td className="p-3 text-right font-mono">{currencyFormatter.format(loan.principal)}</td><td className="p-3 text-right font-mono">{loan.interestRate.toFixed(2)}%</td><td className="p-3 text-slate-400">{loan.issueDate}</td></tr>))}</tbody>
              </table>
          </div>
        )}
      </div>

      <div className="mt-12">
        <h3 className="text-xl font-semibold text-slate-300 mb-4">Planned Assets</h3>
        {allPlannedAssets.length === 0 ? (<div className="text-center py-16 border-2 border-dashed border-slate-700 rounded-lg"><h3 className="text-lg text-slate-400">No planned assets found.</h3><p className="text-slate-500 mt-1 text-sm">Plan future capital expenditures by adding an asset.</p></div>
        ) : (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-x-auto">
             <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-600"><th className="text-left p-3 font-semibold">Asset Name</th><th className="text-left p-3 font-semibold">Entity</th><th className="text-left p-3 font-semibold">Type</th><th className="text-right p-3 font-semibold">Est. Value</th></tr></thead>
                <tbody>{allPlannedAssets.map(asset => (<tr key={asset.id} className="border-b border-slate-800"><td className="p-3 font-medium">{asset.name}</td><td className="p-3 text-slate-400">{asset.entityName}</td><td className="p-3 text-slate-400">{asset.type} ({asset.category})</td><td className="p-3 text-right font-mono">{currencyFormatter.format(asset.estimatedValue)}</td></tr>))}</tbody>
              </table>
          </div>
        )}
      </div>

       {loanModalData && (<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="bg-slate-800 w-full max-w-md rounded-lg shadow-2xl border border-slate-700 p-6"><h3 className="text-xl font-semibold text-white mb-2">Issue Loan</h3><p className="text-sm text-slate-400 mb-4">From reserve: <span className="font-medium text-slate-200">{loanModalData.reserve.name}</span></p><form onSubmit={handleIssueLoan}><div className="space-y-4"><div><label className="block text-sm font-medium text-slate-400 mb-1">Borrower Name</label><input autoFocus type="text" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={loanForm.borrower} onChange={e => setLoanForm({...loanForm, borrower: e.target.value})} required /></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Principal Amount ($)</label><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={loanForm.principal} onChange={e => setLoanForm({...loanForm, principal: Number(e.target.value)})} required min="0.01" step="0.01" max={loanModalData.reserve.currentBalance} /></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Annual Interest Rate (%)</label><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={loanForm.interestRate} onChange={e => setLoanForm({...loanForm, interestRate: Number(e.target.value)})} required min="0" step="0.01" /></div></div><div className="flex justify-end gap-3 mt-6"><button type="button" onClick={() => setLoanModalData(null)} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button><button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium text-sm text-white">Confirm & Issue Loan</button></div></form></div></div>)}
      {isRepaymentModalOpen && (<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="bg-slate-800 w-full max-w-md rounded-lg shadow-2xl border border-slate-700 p-6"><h3 className="text-xl font-semibold text-white mb-4">Process Loan Repayment</h3><form onSubmit={handleRepayment}><div className="space-y-4"><div><label className="block text-sm font-medium text-slate-400 mb-1">Select Loan to Repay</label><select className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={repaymentForm.loanId} onChange={e => setRepaymentForm({ loanId: e.target.value, amount: '' })} required><option value="" disabled>-- Select a loan --</option>{allActiveLoans.map(loan => (<option key={loan.id} value={loan.id}>{loan.borrower} - {currencyFormatter.format(loan.principal)} ({loan.entityName})</option>))}</select></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Total Repayment Amount ($)</label><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={repaymentForm.amount} onChange={e => setRepaymentForm({...repaymentForm, amount: e.target.value})} required min={allActiveLoans.find(l => l.id === repaymentForm.loanId)?.principal || 0} step="0.01" placeholder="e.g., 1050.00"/></div></div><div className="flex justify-end gap-3 mt-6"><button type="button" onClick={() => setIsRepaymentModalOpen(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button><button type="submit" disabled={!repaymentForm.loanId || !repaymentForm.amount} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md font-medium text-sm text-white disabled:bg-slate-500">Confirm Repayment</button></div></form></div></div>)}
      {isAssetModalOpen && (<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"><div className="bg-slate-800 w-full max-w-lg rounded-lg shadow-2xl border border-slate-700"><form onSubmit={handleSavePlannedAsset}><div className="p-6"><h3 className="text-xl font-semibold text-white mb-4">Plan New Asset</h3><div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar"><div><label className="block text-sm font-medium text-slate-400 mb-1">Entity</label><select value={assetForm.entityId} onChange={e => setAssetForm({...assetForm, entityId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required><option value="" disabled>Select an entity</option>{entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Asset Name</label><input autoFocus type="text" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} required placeholder="e.g., Downtown Office Building, Family Heirlooms"/></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-400 mb-1">Asset Category</label><select value={assetForm.category} onChange={e => setAssetForm({...assetForm, category: e.target.value as AssetCategory})} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2">{assetCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Specific Asset Type</label><input type="text" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={assetForm.type} onChange={e => setAssetForm({...assetForm, type: e.target.value})} required placeholder="e.g., Commercial Property, Stocks, Note"/></div></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Estimated Value ($)</label><input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" value={assetForm.estimatedValue} onChange={e => setAssetForm({...assetForm, estimatedValue: Number(e.target.value)})} required min="0" step="0.01"/></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Usage Plan & Description</label><textarea value={assetForm.description} onChange={e => setAssetForm({...assetForm, description: e.target.value})} rows={3} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" placeholder="Describe the asset, its purpose, or relevant details..."></textarea></div><div><label className="block text-sm font-medium text-slate-400 mb-1">Link to Reserve (Optional)</label><select value={assetForm.linkedReserveId} onChange={e => setAssetForm({...assetForm, linkedReserveId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"><option value="">None</option>{allReserves.filter(r => r.category === 'Capital Expenditure').map(r => <option key={r.id} value={r.id}>{r.entityName} - {r.name}</option>)}</select></div></div></div><div className="flex justify-end gap-3 mt-2 p-4 bg-slate-900/50 border-t border-slate-700"><button type="button" onClick={() => setIsAssetModalOpen(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button><button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md font-medium text-sm text-white">Save Plan</button></div></form></div></div>)}
    </div>
  );
};