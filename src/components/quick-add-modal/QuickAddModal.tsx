import React, { useState, useEffect } from 'react';
import { Entity, JournalEntry } from '../../types/app.models';
import { geminiService } from '../../services/gemini.service';

interface QuickAddModalProps {
  entities: Entity[];
  onClose: () => void;
  onPostEntry: (entityId: string, entry: JournalEntry) => void;
}

type Step = 'input' | 'processing' | 'confirmation' | 'error';
type EntryMode = 'file' | 'manual';
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ entities, onClose, onPostEntry }) => {
  const [step, setStep] = useState<Step>('input');
  const [entryMode, setEntryMode] = useState<EntryMode>('file');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  
  // File mode state
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState('');
  
  // Manual mode state
  const [manualDescription, setManualDescription] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [suggestedEntry, setSuggestedEntry] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (entities.length > 0) {
      setSelectedEntityId(entities[0].id);
    }
  }, [entities]);

  const handleProcess = async () => {
    if (!selectedEntityId) return;
    setStep('processing');
    setError(null);
    
    try {
      let result;
      if (entryMode === 'file' && file) {
        result = await geminiService.analyzeFinancialDocumentForJournalEntry(file, context);
      } else if (entryMode === 'manual' && manualDescription) {
        const rawResult = await geminiService.analyzeTransaction(manualDescription);
        // Adapt the result to the JournalEntry interface
        result = {
            id: crypto.randomUUID(),
            date: rawResult.date,
            description: rawResult.description,
            lines: rawResult.entries.map(e => ({ account: e.account, debit: e.debit, credit: e.credit }))
        };
      } else {
        throw new Error("No input provided for analysis.");
      }
      setSuggestedEntry(result);
      setStep('confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during analysis.');
      setStep('error');
    }
  };

  const handlePost = () => {
    if (suggestedEntry && selectedEntityId) {
      onPostEntry(selectedEntityId, suggestedEntry);
    }
  };
  
  const reset = () => {
    setStep('input');
    setFile(null);
    setContext('');
    setManualDescription('');
    setError(null);
    setSuggestedEntry(null);
  };

  const isProcessButtonDisabled = 
    !selectedEntityId ||
    (entryMode === 'file' && !file) ||
    (entryMode === 'manual' && !manualDescription.trim());

  const renderContent = () => {
    switch (step) {
      case 'input':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Select Entity/Account</label>
              <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            
            <div className="border-b border-slate-700">
              <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                <button onClick={() => setEntryMode('file')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${entryMode === 'file' ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                  Upload Document
                </button>
                <button onClick={() => setEntryMode('manual')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${entryMode === 'manual' ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                  Manual Entry
                </button>
              </nav>
            </div>

            {entryMode === 'file' && (
              <div className="space-y-4 pt-4 animate-fade-in">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Upload Document</label>
                  <div className="p-4 bg-slate-800 rounded-md border-2 border-dashed border-slate-600 text-center">
                    <input id="quick-add-upload" type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" />
                    <label htmlFor="quick-add-upload" className="cursor-pointer text-sm text-blue-400 font-semibold hover:text-blue-300">{file ? file.name : 'Select a file (image, pdf, csv, etc.)'}</label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Provide Context (Optional)</label>
                  <textarea value={context} onChange={e => setContext(e.target.value)} rows={2} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" placeholder="e.g., 'Paid monthly office rent'"></textarea>
                </div>
              </div>
            )}

            {entryMode === 'manual' && (
              <div className="space-y-4 pt-4 animate-fade-in">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Describe the Transaction</label>
                  <textarea value={manualDescription} onChange={e => setManualDescription(e.target.value)} autoFocus rows={3} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" placeholder="e.g., 'Paid $1,500 for office rent on May 1st' or 'Invoice #123 for $300 to Client Corp for design services'"></textarea>
                </div>
              </div>
            )}
          </>
        );
      case 'processing':
        return (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            <p className="mt-4 text-slate-300">AI is analyzing your input...</p>
            <p className="text-sm text-slate-500">Generating balanced journal entry.</p>
          </div>
        );
      case 'confirmation':
        if (!suggestedEntry) return null;
        const totalDebits = suggestedEntry.lines.reduce((sum, line) => sum + line.debit, 0);
        const totalCredits = suggestedEntry.lines.reduce((sum, line) => sum + line.credit, 0);
        return (
          <div>
            <h4 className="font-semibold text-slate-300 mb-3">Suggested Journal Entry</h4>
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Date:</span>
                <span className="font-medium">{suggestedEntry.date}</span>
              </div>
              <div className="text-sm">
                <p className="text-slate-400">Description:</p>
                <p className="font-medium">{suggestedEntry.description}</p>
              </div>
              <table className="w-full text-sm mt-2">
                <thead><tr className="border-b border-slate-600"><th className="text-left font-semibold pb-1">Account</th><th className="text-right font-semibold pb-1">Debit</th><th className="text-right font-semibold pb-1">Credit</th></tr></thead>
                <tbody>
                  {suggestedEntry.lines.map((line, i) => (
                    <tr key={i}><td className="py-1">{line.account}</td><td className="text-right font-mono">{line.debit > 0 ? currencyFormatter.format(line.debit) : ''}</td><td className="text-right font-mono">{line.credit > 0 ? currencyFormatter.format(line.credit) : ''}</td></tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-500 font-bold">
                  <tr><td className="pt-1">Total</td><td className="pt-1 text-right font-mono">{currencyFormatter.format(totalDebits)}</td><td className="pt-1 text-right font-mono">{currencyFormatter.format(totalCredits)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h4 className="font-semibold text-red-300 text-lg mt-3">Analysis Failed</h4>
            <p className="mt-2 text-sm bg-red-900/30 p-3 rounded-md text-red-300">{error}</p>
          </div>
        );
    }
  };

  const renderFooter = () => {
    switch (step) {
      case 'input':
        return <button onClick={handleProcess} disabled={isProcessButtonDisabled} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-medium text-sm text-white disabled:bg-slate-500">Process with AI</button>;
      case 'confirmation':
        return <>
          <button onClick={reset} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button>
          <button onClick={handlePost} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-md font-medium text-sm text-white">Post Entry</button>
        </>;
      case 'error':
        return <button onClick={reset} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-medium text-sm text-white">Try Again</button>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 w-full max-w-lg rounded-lg shadow-2xl border border-slate-700 flex flex-col">
        <div className="flex-shrink-0 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-white">Quick Add Transaction</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
        </div>
        <div className="flex-grow p-6 space-y-4">
          {renderContent()}
        </div>
        <div className="flex-shrink-0 flex justify-end gap-3 p-4 bg-slate-900/50 border-t border-slate-700">
          {step !== 'processing' && step !== 'confirmation' && <button onClick={onClose} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button>}
          {renderFooter()}
        </div>
      </div>
    </div>
  );
};