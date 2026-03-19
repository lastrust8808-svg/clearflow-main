import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Entity, AnalysisResult, PlaidVerificationStatus, IdentityVerificationStatus, PlaidTransaction } from '../../types/app.models';
import { geminiService } from '../../services/gemini.service';
import { googleDriveService } from '../../services/google-drive.service';
import { useAuth } from '../../hooks/useAuth';
import { plaidService } from '../../services/plaid.service';
import { DigitalAssetRegistryWidget } from '../DigitalAssetRegistryWidget';
import { WizardWidget } from './WizardWidget';

const ALLOWED_MIME_TYPES = ['application/pdf', 'text/csv', 'image/jpeg', 'image/png'];
type ActiveTab = 'documents' | 'accounting' | 'transactions' | 'reserve' | 'assets' | 'wizards';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

interface EntityDetailProps {
  entity: Entity;
  onBack: () => void;
  onUpdate: (entity: Entity) => void;
  onRefreshAuth: (entityId: string) => void;
  onRefreshIdentity: (entityId: string) => void;
}

const getAuthVerificationStatusPill = (status?: PlaidVerificationStatus) => {
  const styles: { [key in PlaidVerificationStatus]: string } = {
    'automatically_verified': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'manually_verified': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'pending_manual_verification': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'pending_automatic_verification': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    'verification_expired': 'bg-red-500/20 text-red-400 border-red-500/30',
    'verification_failed': 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  const text = status ? status.replace(/_/g, ' ') : 'Unknown';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize border ${styles[status!] || 'bg-slate-700 text-slate-400'}`}>{text}</span>;
};

const getIdentityVerificationStatusPill = (status?: IdentityVerificationStatus) => {
  const styles: { [key in IdentityVerificationStatus]: string } = {
    'verified': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'pending_document': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'failed': 'bg-red-500/20 text-red-400 border-red-500/30',
    'unverified': 'bg-slate-700 text-slate-400 border-slate-600'
  };
  const text = status ? status.replace(/_/g, ' ') : 'Unknown';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize border ${styles[status!] || 'bg-slate-700 text-slate-400'}`}>{text}</span>;
};


export const EntityDetail: React.FC<EntityDetailProps> = ({ entity, onBack, onUpdate, onRefreshAuth, onRefreshIdentity }) => {
  const auth = useAuth();
  const isBusinessEntity = entity.type !== 'Personal';
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounting');

  // Documents Tab State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [saveToDriveStatus, setSaveToDriveStatus] = useState<'success' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transactions Tab State
  const [transactions, setTransactions] = useState<PlaidTransaction[]>(entity.transactions || []);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [transactionsError, setTransactionsError] = useState('');
  
  // Verification states
  const [microDeposit1, setMicroDeposit1] = useState('');
  const [microDeposit2, setMicroDeposit2] = useState('');
  const [microDepositError, setMicroDepositError] = useState('');
  const [isVerifyingMicroDeposits, setIsVerifyingMicroDeposits] = useState(false);

  const [stepUpDoc, setStepUpDoc] = useState<File | null>(null);
  const [stepUpError, setStepUpError] = useState('');
  const [isVerifyingStepUpDoc, setIsVerifyingStepUpDoc] = useState(false);
  
  const [showAuthRefreshSuccess, setShowAuthRefreshSuccess] = useState(false);
  const [showIdentityRefreshSuccess, setShowIdentityRefreshSuccess] = useState(false);

  const availableTabs: ActiveTab[] = useMemo(() => ['accounting', 'transactions', 'reserve', 'assets', 'wizards', ...(isBusinessEntity ? ['documents' as const] : [])], [isBusinessEntity]);
  
  const fetchTransactions = useCallback(async () => {
    if (!entity.itemId) return;
    setIsFetchingTransactions(true);
    setTransactionsError('');
    try {
      const data = await plaidService.getTransactions(entity.itemId);
      setTransactions(data);
      onUpdate({ ...entity, transactions: data });
    } catch (e) {
      setTransactionsError(e instanceof Error ? e.message : 'Failed to fetch transactions');
    } finally {
      setIsFetchingTransactions(false);
    }
  }, [entity.itemId, onUpdate, entity]);

  useEffect(() => {
    if (activeTab === 'transactions' && (!transactions || transactions.length === 0)) {
      fetchTransactions();
    }
  }, [activeTab, transactions, fetchTransactions]);

  const handleSyncTransactions = async () => {
    if (!entity.itemId) return;
    setIsFetchingTransactions(true);
    setTransactionsError('');
    try {
        const data = await plaidService.syncTransactions(entity.itemId);
        setTransactions(data);
        onUpdate({ ...entity, transactions: data });
    } catch (e) {
        setTransactionsError(e instanceof Error ? e.message : 'Failed to sync transactions');
    } finally {
        setIsFetchingTransactions(false);
    }
  };


  const handleFile = (file: File | undefined | null) => { setAnalysisResult(null); setError(''); if (!file) { setSelectedFile(null); return; } if (!ALLOWED_MIME_TYPES.includes(file.type)) { setFileError(`Invalid file type.`); setSelectedFile(null); return; } setFileError(''); setSelectedFile(file); };
  const analyze = async () => { if (!selectedFile) return; setIsAnalyzing(true); setAnalysisResult(null); setError(''); setSaveToDriveStatus(null); try { const result = await geminiService.analyzeDocument(selectedFile); setAnalysisResult(result); } catch (e) { setError(e instanceof Error ? e.message : 'An unknown error occurred.'); } finally { setIsAnalyzing(false); } };
  const saveToDrive = async () => { if (!analysisResult || !selectedFile || !auth.apiAccessToken) return; setIsSavingToDrive(true); try { const fileName = `Analysis of ${selectedFile.name} for ${entity.name}`; await googleDriveService.saveAnalysisAsDoc(auth.apiAccessToken, fileName, analysisResult, entity.name); setSaveToDriveStatus('success'); } catch (e) { setSaveToDriveStatus('error'); } finally { setIsSavingToDrive(false); setTimeout(() => setSaveToDriveStatus(null), 5000); } };
  
  const handleVerifyMicroDeposits = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingMicroDeposits(true);
    setMicroDepositError('');
    await new Promise(res => setTimeout(res, 1500)); // Simulate API call
    if (microDeposit1 === '0.07' && microDeposit2 === '0.11') {
      onUpdate({ ...entity, bankVerificationStatus: 'manually_verified' });
    } else {
      setMicroDepositError('Amounts do not match. Please check your bank statement and try again.');
    }
    setIsVerifyingMicroDeposits(false);
  };
  
  const handleVerifyStepUpDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepUpDoc) return;
    setIsVerifyingStepUpDoc(true);
    setStepUpError('');
    await new Promise(res => setTimeout(res, 2000)); // Simulate document analysis
    onUpdate({ ...entity, identityVerificationStatus: 'verified' });
    setIsVerifyingStepUpDoc(false);
  };
  
  const handleAuthRefreshClick = async () => {
    await onRefreshAuth(entity.id);
    setShowAuthRefreshSuccess(true);
    setTimeout(() => setShowAuthRefreshSuccess(false), 3000);
  };
  
  const handleIdentityRefreshClick = async () => {
    await onRefreshIdentity(entity.id);
    setShowIdentityRefreshSuccess(true);
    setTimeout(() => setShowIdentityRefreshSuccess(false), 3000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="bg-slate-800/50 p-6 sm:p-8 rounded-lg border border-slate-700 relative">
        <div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-700">
          <div><h2 className="text-3xl font-semibold mb-1 text-white">{entity.type !== 'Personal' ? 'Entity Management' : 'Account Management'}</h2><p className="text-slate-400">Dashboard for: <span className="font-medium text-blue-400">{entity.name}</span></p></div>
          <button onClick={onBack} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md">Back to Dashboard</button>
        </div>

        <div className="mb-6 border-b border-slate-600"><nav className="-mb-px flex space-x-6">{availableTabs.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</nav></div>

        {activeTab === 'accounting' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
                <h3 className="text-lg font-semibold text-slate-300">Financial Connection & Verification</h3>
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 space-y-3 text-sm">
                    <div className="flex justify-between items-center"><span className="text-slate-400">ACH Auth Verification</span>{getAuthVerificationStatusPill(entity.bankVerificationStatus)}</div>
                    <div className="flex justify-between items-center"><span className="text-slate-400">Identity Verification</span>{getIdentityVerificationStatusPill(entity.identityVerificationStatus)}</div>
                    <div className="pt-3 border-t border-slate-800 flex justify-between items-center"><span className="text-slate-400">Bank-Sourced Owner</span><span className="font-medium text-slate-200 truncate">{entity.bankSourcedOwnerNames?.[0] || 'N/A'}</span></div>
                    {entity.accountNumbers?.ach?.[0]?.isTokenized && <div className="group relative pt-3 border-t border-slate-800 flex justify-between items-center"><span className="text-slate-400">Account Number</span><span className="font-mono text-slate-200">Tokenized</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-slate-900 text-xs text-slate-300 border border-slate-600 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">Bank provided a tokenized number; this is normal and enhances security.</div></div>}
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                        <button onClick={handleAuthRefreshClick} className="w-full text-center text-xs px-3 py-1.5 bg-slate-700/80 text-white font-semibold rounded-md hover:bg-slate-700 transition-colors">Simulate Bank Info Update (Webhook)</button>
                        {showAuthRefreshSuccess && <p className="text-emerald-400 text-xs text-center animate-fade-in">Bank details refreshed automatically.</p>}
                        <button onClick={handleIdentityRefreshClick} className="w-full text-center text-xs px-3 py-1.5 bg-slate-700/80 text-white font-semibold rounded-md hover:bg-slate-700 transition-colors">Simulate Identity Info Update (Webhook)</button>
                        {showIdentityRefreshSuccess && <p className="text-emerald-400 text-xs text-center animate-fade-in">Bank-sourced identity data refreshed.</p>}
                    </div>
                </div>
            </div>
            <div className="lg:col-span-2">
              <h3 className="text-lg font-semibold text-slate-300 mb-3">General Journal</h3>
              <div className="bg-slate-900/50 rounded-lg border border-slate-700 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {(entity.journal ?? []).length === 0 ? <p className="text-slate-500 text-center p-8">No journal entries recorded.</p> : (<table className="w-full text-sm"><thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-600"><th className="text-left p-3 font-semibold">Date</th><th className="text-left p-3 font-semibold">Description</th><th className="text-left p-3 font-semibold">Account</th><th className="text-right p-3 font-semibold">Debit</th><th className="text-right p-3 font-semibold">Credit</th></tr></thead><tbody>{(entity.journal ?? []).flatMap(entry => entry.lines.map((line, i) => (<tr key={`${entry.id}-${i}`} className="border-b border-slate-800">{i === 0 && <td rowSpan={entry.lines.length} className="p-3 align-top">{entry.date}</td>}{i === 0 && <td rowSpan={entry.lines.length} className="p-3 align-top">{entry.description}</td>}<td className="p-3">{line.account}</td><td className="p-3 text-right font-mono">{line.debit > 0 ? currencyFormatter.format(line.debit) : null}</td><td className="p-3 text-right font-mono">{line.credit > 0 ? currencyFormatter.format(line.credit) : null}</td></tr>)))}</tbody></table>)}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
           <div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-300">Bank Transactions</h3>
                  <button onClick={handleSyncTransactions} disabled={isFetchingTransactions} className="px-4 py-1.5 bg-blue-600/80 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors text-xs disabled:bg-slate-500 disabled:cursor-wait">
                      {isFetchingTransactions ? 'Syncing...' : 'Sync Transactions'}
                  </button>
              </div>
               <div className="bg-slate-900/50 rounded-lg border border-slate-700 max-h-[600px] overflow-y-auto custom-scrollbar">
                   {isFetchingTransactions && transactions.length === 0 ? <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div></div> : 
                   transactionsError ? <p className="text-red-400 text-center p-8">{transactionsError}</p> :
                   transactions.length === 0 ? <p className="text-slate-500 text-center p-8">No transactions found. Sync to fetch the latest data.</p> :
                   (<table className="w-full text-sm"><thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-600"><th className="text-left p-3 font-semibold">Date</th><th className="text-left p-3 font-semibold">Name</th><th className="text-right p-3 font-semibold">Amount</th><th className="text-center p-3 font-semibold">Status</th></tr></thead>
                   <tbody>{transactions.map(tx => <tr key={tx.transaction_id} className="border-b border-slate-800"><td className="p-3 whitespace-nowrap">{tx.date}</td><td className="p-3">{tx.name}</td><td className={`p-3 text-right font-mono ${tx.amount < 0 ? 'text-emerald-400' : 'text-slate-300'}`}>{currencyFormatter.format(tx.amount * -1)}</td><td className="p-3 text-center">{tx.pending ? <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300">Pending</span> : <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-700 text-slate-300">Posted</span>}</td></tr>)}</tbody>
                   </table>)}
               </div>
           </div>
        )}

        {activeTab === 'documents' && (
           <div>
            <h3 className="text-lg font-semibold text-slate-300 mb-4">Document Analysis</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <div onDragOver={e => {e.preventDefault(); setIsDragOver(true);}} onDragLeave={() => setIsDragOver(false)} onDrop={e => {e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files[0]);}} className={`p-6 bg-slate-800 rounded-lg border-2 border-dashed ${isDragOver ? 'border-blue-400' : 'border-slate-600'} text-center`}>
                  <input ref={fileInputRef} id="doc-upload" type="file" onChange={e => handleFile(e.target.files?.[0])} accept={ALLOWED_MIME_TYPES.join(',')} className="hidden" />
                  <svg className="mx-auto h-12 w-12 text-slate-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  <label htmlFor="doc-upload" className="mt-2 block cursor-pointer text-sm font-semibold text-blue-400 hover:text-blue-300">Click to upload or drag and drop</label>
                  <p className="text-xs text-slate-500 mt-1">PDF, CSV, JPG, or PNG</p>
                </div>
                 {selectedFile && <div className="mt-4 p-3 bg-slate-900/50 border border-slate-700 rounded-md text-sm"><p className="font-medium text-slate-300 truncate">{selectedFile.name}</p><p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(2)} KB</p></div>}
                 {fileError && <p className="text-red-400 text-sm mt-2">{fileError}</p>}
                <button onClick={analyze} disabled={!selectedFile || isAnalyzing} className="mt-4 w-full px-5 py-2 bg-purple-600 text-white font-semibold rounded-md text-sm hover:bg-purple-700 disabled:bg-slate-500">{isAnalyzing ? 'Analyzing...' : 'Analyze Document with AI'}</button>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 min-h-[200px]">
                {isAnalyzing ? <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div></div> : 
                 error ? <div className="text-red-400 p-4 text-sm">{error}</div> :
                 analysisResult ? (<div className="space-y-4 text-sm animate-fade-in"><h4 className="font-semibold text-slate-200">{analysisResult.documentType || 'Analysis Result'}</h4><p className="text-slate-400">{analysisResult.summary}</p><div className="border-t border-slate-700 pt-3 space-y-2"><p><strong>Entity Name:</strong> {analysisResult.entityName}</p><p><strong>EIN:</strong> {analysisResult.ein}</p></div>{auth.hasDriveAccess && <button onClick={saveToDrive} disabled={isSavingToDrive || saveToDriveStatus === 'success'} className="mt-2 w-full text-center px-4 py-1.5 bg-emerald-600/80 text-white font-semibold rounded-md text-xs hover:bg-emerald-700 disabled:bg-slate-500">{isSavingToDrive ? 'Saving...' : (saveToDriveStatus === 'success' ? 'Saved to Drive!' : 'Save to Google Drive')}</button>}</div>) :
                 <div className="flex items-center justify-center h-full"><p className="text-slate-500">Analysis results will appear here.</p></div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reserve' && (
          <div>
            <h3 className="text-lg font-semibold text-slate-300 mb-4">Reserve Accounts</h3>
            {(entity.reserves && entity.reserves.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {entity.reserves.map(reserve => {
                  const progress = reserve.targetAmount > 0 ? (reserve.currentBalance / reserve.targetAmount) * 100 : 0;
                  return (
                    <div key={reserve.id} className="bg-slate-900/50 p-5 rounded-lg border border-slate-700">
                      <div className="flex justify-between items-start"><h4 className="font-semibold text-slate-200">{reserve.name}</h4><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{reserve.category}</span></div>
                      <p className="text-sm text-slate-400 mt-2">{reserve.purpose}</p>
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{currencyFormatter.format(reserve.currentBalance)}</span><span>Target: {currencyFormatter.format(reserve.targetAmount)}</span></div>
                        <div className="w-full bg-slate-700 rounded-full h-2.5"><div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }}></div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-slate-700 rounded-lg">
                <p className="text-slate-500">No reserve accounts configured for this entity.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="h-[700px] -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 border-t border-slate-700">
            <DigitalAssetRegistryWidget 
              entity={entity} 
              onClose={() => setActiveTab('accounting')} 
            />
          </div>
        )}

        {activeTab === 'wizards' && (
          <div className="h-[700px] -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 border-t border-slate-700">
            <WizardWidget 
              entity={entity} 
              onUpdate={onUpdate}
              onClose={() => setActiveTab('accounting')} 
            />
          </div>
        )}
      </div>

      {entity.bankVerificationStatus === 'pending_manual_verification' && (
        <div className="bg-slate-800/50 p-6 sm:p-8 rounded-lg border border-amber-500/30">
          <h3 className="text-lg font-semibold text-amber-300">Action Required: Verify Micro-Deposits</h3>
          <p className="text-sm text-slate-400 mt-2 mb-4">We sent two small deposits to your connected bank account. Please enter the amounts below to verify your account for ACH payments.</p>
          <form onSubmit={handleVerifyMicroDeposits} className="flex flex-col sm:flex-row items-start gap-4">
            <input type="text" value={microDeposit1} onChange={e => setMicroDeposit1(e.target.value)} placeholder="0.07" className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 w-full sm:w-32" required />
            <input type="text" value={microDeposit2} onChange={e => setMicroDeposit2(e.target.value)} placeholder="0.11" className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 w-full sm:w-32" required />
            <button type="submit" disabled={isVerifyingMicroDeposits} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-md text-sm hover:bg-blue-700 disabled:bg-slate-500">{isVerifyingMicroDeposits ? 'Verifying...' : 'Verify'}</button>
          </form>
          {microDepositError && <p className="text-red-400 text-sm mt-3">{microDepositError}</p>}
        </div>
      )}

      {entity.identityVerificationStatus === 'pending_document' && (
        <div className="bg-slate-800/50 p-6 sm:p-8 rounded-lg border border-amber-500/30">
          <h3 className="text-lg font-semibold text-amber-300">Action Required: Step-Up Verification</h3>
          <p className="text-sm text-slate-400 mt-2 mb-4">Your name partially matched the bank records. Please upload a supporting document (e.g., bank statement) to complete identity verification.</p>
          <form onSubmit={handleVerifyStepUpDoc}>
            <div className="p-4 bg-slate-800 rounded-md border-2 border-dashed border-slate-600 text-center">
              <input id="stepup-upload" type="file" onChange={e => setStepUpDoc(e.target.files?.[0] || null)} accept="image/*, application/pdf" className="hidden" />
              <label htmlFor="stepup-upload" className="cursor-pointer text-sm text-blue-400 font-semibold hover:text-blue-300">{stepUpDoc ? stepUpDoc.name : 'Select Document'}</label>
            </div>
            <button type="submit" disabled={isVerifyingStepUpDoc || !stepUpDoc} className="mt-4 px-5 py-2 bg-blue-600 text-white font-semibold rounded-md text-sm hover:bg-blue-700 disabled:bg-slate-500">{isVerifyingStepUpDoc ? 'Verifying...' : 'Submit Document'}</button>
          </form>
          {stepUpError && <p className="text-red-400 text-sm mt-3">{stepUpError}</p>}
        </div>
      )}
    </div>
  );
};