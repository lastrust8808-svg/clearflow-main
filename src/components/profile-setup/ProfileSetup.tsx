import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const ProfileSetup: React.FC = () => {
  const auth = useAuth();
  const [form, setForm] = useState({
    name: auth.currentUser?.name ?? '',
    email: auth.currentUser?.email ?? '',
    phone: auth.currentUser?.phone ?? '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name && (form.email || form.phone)) {
      auth.completeProfileSetup(form.name, form.email || undefined, form.phone || undefined);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="p-8 bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-100 text-center">Your Account is Ready!</h1>
        <p className="text-slate-400 mt-2 text-center mb-8">Welcome to Clear-Flow. Your secure account has been created. Please confirm your details below to continue.</p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-400">Full Name</label>
              <input id="name" name="name" type="text" value={form.name} onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" required />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-400">Email Address</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-400">Phone Number</label>
              <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">At least one contact method is required.</p>
          <button type="submit" disabled={!form.name || (!form.email && !form.phone)} className="w-full mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-slate-500">
            Confirm and Enter
          </button>
        </form>
      </div>
    </div>
  );
};
