import React, { useState, useEffect, useMemo } from 'react';
import { Entity } from '../../types/app.models';

interface InternalTransferModalProps {
  entities: Entity[];
  onClose: () => void;
  onInitiateTransfer: (data: { fromEntityId: string; toEntityId: string; amount: number; memo?: string; }) => void;
}

export const InternalTransferModal: React.FC<InternalTransferModalProps> = ({ entities, onClose, onInitiateTransfer }) => {
  const [form, setForm] = useState({
    fromEntityId: '',
    toEntityId: '',
    amount: '',
    memo: ''
  });

  useEffect(() => {
    if (entities.length >= 2) {
      setForm(f => ({ ...f, fromEntityId: entities[0].id, toEntityId: entities[1].id }));
    }
  }, [entities]);

  const availableToEntities = useMemo(() => {
    return entities.filter(e => e.id !== form.fromEntityId);
  }, [entities, form.fromEntityId]);
  
  // Adjust 'to' entity if 'from' entity changes to prevent invalid state
  useEffect(() => {
    if (form.fromEntityId && form.toEntityId === form.fromEntityId) {
      setForm(f => ({ ...f, toEntityId: availableToEntities[0]?.id || '' }));
    }
  }, [form.fromEntityId, form.toEntityId, availableToEntities]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromEntityId || !form.toEntityId || !form.amount) return;
    onInitiateTransfer({
      fromEntityId: form.fromEntityId,
      toEntityId: form.toEntityId,
      amount: parseFloat(form.amount),
      memo: form.memo
    });
  };

  const isFormValid = form.fromEntityId && form.toEntityId && parseFloat(form.amount) > 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 w-full max-w-lg rounded-lg shadow-2xl border border-slate-700 flex flex-col">
        <div className="flex-shrink-0 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-white">New Internal Transfer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
        </div>
        <form id="internal-transfer-form" onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">From Account</label>
              <select name="fromEntityId" value={form.fromEntityId} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name} (****{e.accountNumbers?.ach?.[0]?.account.slice(-4)})</option>)}
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">To Account</label>
              <select name="toEntityId" value={form.toEntityId} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required>
                {availableToEntities.map(e => <option key={e.id} value={e.id}>{e.name} (****{e.accountNumbers?.ach?.[0]?.account.slice(-4)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Amount ($)</label>
              <input name="amount" type="number" value={form.amount} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" step="0.01" min="0.01" required placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Memo (Optional)</label>
              <textarea name="memo" value={form.memo} onChange={handleChange} rows={2} className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"></textarea>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-end gap-3 p-4 bg-slate-900/50 border-t border-slate-700">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-medium text-sm">Cancel</button>
            <button type="submit" form="internal-transfer-form" disabled={!isFormValid} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-medium text-sm text-white disabled:bg-slate-500">Initiate Transfer</button>
          </div>
        </form>
      </div>
    </div>
  );
};