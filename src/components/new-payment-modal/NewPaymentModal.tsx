import React, { useState, useEffect } from 'react';
import { Entity, PaymentRail, PlaidSignalResponse } from '../../types/app.models';
import { plaidService } from '../../services/plaid.service';
import { useAuth } from '../../hooks/useAuth';

interface NewPaymentModalProps {
  entities: Entity[];
  onClose: () => void;
  onInitiatePayment: (paymentData: { entityId: string; amount: number; recipientName: string; memo?: string; signalResponse: PlaidSignalResponse; rail: PaymentRail; }) => void;
}

type Step = 'input' | 'processing' | 'rerouted' | 'review' | 'success' | 'unverified';

export const NewPaymentModal: React.FC<NewPaymentModalProps> = ({ entities, onClose, onInitiatePayment }) => {
  const { currentUser } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [form, setForm] = useState({
    entityId: '',
    recipientName: '',
    accountNumber: '',
    routingNumber: '',
    amount: '',
    memo: '',
    rail: 'ACH' as PaymentRail,
  });
  const [error, setError] = useState<string | null>(null);
  const [signalResponse, setSignalResponse] = useState<PlaidSignalResponse | null>(null);

  useEffect(() => {
    if (entities.length > 0) {
      setForm(f => ({ ...f, entityId: entities[0].id }));
    }
  }, [entities]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedEntity = entities.find(en => en.id === form.entityId);
    if (!selectedEntity || !selectedEntity.accountNumbers?.ach?.[0] || !selectedEntity.itemId) {
        setError('Selected entity does not have valid bank account information.');
        return;
    }
    
    // Verification Gating
    const isAuthVerified = selectedEntity.bankVerificationStatus === 'automatically_verified' || selectedEntity.bankVerificationStatus === 'manually_verified';
    const isIdentityVerified = selectedEntity.identityVerificationStatus === 'verified';
    
    if (!isAuthVerified || !isIdentityVerified) {
        setStep('unverified');
        return;
    }

    setStep('processing');
    setError(null);
    
    try {
      // 1. Prepare Signal
      await plaidService.signalPrepare(selectedEntity.itemId);

      // 2. Evaluate Signal
      const response = await plaidService.signalEvaluate({
        itemId: selectedEntity.itemId,
        accountId: selectedEntity.accountNumbers.ach[0].account,
        amount: parseFloat(form.amount),
        clientTransactionId: crypto.randomUUID().slice(0, 36),
        clientUserId: currentUser?.id,
        // Optional user and device data could be added here for better accuracy
      });
      setSignalResponse(response);

      // 3. Enforce decision
      switch(response.decision) {
        case 'ACCEPT':
          onInitiatePayment({
            entityId: form.entityId,
            amount: parseFloat(form.amount),
            recipientName: form.recipientName,
            memo: form.memo,
            signalResponse: response,
            rail: form.rail
          });
          setStep('success');
          break;
        case 'REROUTE':
          setStep('rerouted');
          break;
        case 'REVIEW':
          setStep('review');
          break;
        default:
          // Fallback to review for any unexpected decision
          setStep('review');
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setStep('input');
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'input':
        return (
            <form id="payment-form" onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-400 mb-1">From Account</label><select name="entityId" value={form.entityId} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required>{entities.map(e => <option key={e.id} value={e.id}>{e.name} (...{e.accountNumbers?.ach?.[0]?.account.slice(-4)})</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Payment Rail</label><select name="rail" value={form.rail} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required><option value="ACH">ACH (1-3 Days)</option><option value="Wire">Wire (Same Day)</option><option value="RTP">RTP (Instant)</option></select></div>
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Amount ($)</label><input name="amount" type="number" value={form.amount} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" step="0.01" min="0.01" required placeholder="Try .99 for risk demo" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-400 mb-1">Recipient Name</label><input name="recipientName" type="text" value={form.recipientName} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Recipient Account Number</label><input name="accountNumber" type="text" value={form.accountNumber} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required /></div>
                <div><label className="block text-sm font-medium text-slate-400 mb-1">Recipient Routing Number</label><input name="routingNumber" type="text" value={form.routingNumber} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-400 mb-1">Memo (Optional)</label><textarea name="memo" value={form.memo} onChange={handleChange} rows={2} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"></textarea></div>
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            </form>
        );
      case 'processing':
        return <div className="text-center py-12"><div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div><p className="mt-4 text-slate-300">Evaluating transaction risk...</p></div>;
      case 'rerouted':
        return <div className="text-center py-8"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><h3 className="mt-3 text-lg font-semibold text-amber-300">Payment Rerouted</h3><p className="text-sm text-slate-400 mt-2">Payment rerouted for risk controls. Please use an alternative payment method.</p><p className="text-xs text-slate-500 mt-4">Reason: <span className="font-mono">{signalResponse?.signal?.ruleset?.triggered_rule_details?.internal_note ?? 'High risk detected'}</span></p></div>;
      case 'review':
        return <div className="text-center py-8"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16l4-4m0 0l4-4m-4 4l-4-4m4 4l4 4m6-4a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><h3 className="mt-3 text-lg font-semibold text-yellow-300">Pending Review</h3><p className="text-sm text-slate-400 mt-2">This transaction requires manual review before it can be processed.</p></div>;
      case 'unverified':
        return <div className="text-center py-8"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><h3 className="mt-3 text-lg font-semibold text-yellow-300">Account Not Verified</h3><p className="text-sm text-slate-400 mt-2">This bank account's ownership and ACH details must be fully verified before you can send payments. Please go to the entity dashboard to complete all verification steps.</p></div>;
      case 'success':
        return <div className="text-center py-8"><svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><h3 className="mt-3 text-lg font-semibold text-emerald-300">Payment Initiated</h3><p className="text-sm text-slate-400 mt-2">Your payment is now pending settlement. You can track its status on the dashboard.</p></div>;
    }
  };

  const renderFooter = () => {
    switch (step) {
      case 'input':
        return <button type="submit" form="payment-form" disabled={!form.entityId || !form.amount} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-medium text-sm text-white disabled:bg-slate-500">Review & Send</button>;
      case 'rerouted':
      case 'review':
      case 'unverified':
        return <button onClick={onClose} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Close</button>;
      case 'success':
        return <button onClick={onClose} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-medium text-sm text-white">Done</button>;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 w-full max-w-lg rounded-lg shadow-2xl border border-slate-700 flex flex-col">
        <div className="flex-shrink-0 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-white">New External Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
        </div>
        <div className="flex-grow p-6">
          {renderContent()}
        </div>
        {step !== 'processing' && (
          <div className="flex-shrink-0 flex justify-end gap-3 p-4 bg-slate-900/50 border-t border-slate-700">
            {step === 'input' && <button onClick={onClose} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button>}
            {renderFooter()}
          </div>
        )}
      </div>
    </div>
  );
};