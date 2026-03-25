import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const ProfileSetup: React.FC = () => {
  const auth = useAuth();
  const [form, setForm] = useState({
    name: auth.currentUser?.name ?? '',
    email: auth.currentUser?.email ?? '',
    phone: auth.currentUser?.phone ?? '',
    acceptedTerms: Boolean(auth.currentUser?.clearflowTermsAcceptedAt),
    signerName:
      auth.currentUser?.clearflowTermsSignerName ||
      auth.currentUser?.name ||
      '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name && (form.email || form.phone)) {
      auth.completeProfileSetup(
        form.name,
        form.email || undefined,
        form.phone || undefined,
        undefined,
        undefined,
        form.acceptedTerms,
        form.signerName || form.name
      );
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="p-8 bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-100 text-center">Your Account is Ready!</h1>
        <p className="text-slate-400 mt-2 text-center mb-8">
          Welcome to ClearFlow. Confirm your profile details below to continue into the workspace.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-400">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-400">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-400">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
              />
            </div>
            <div className="rounded-md border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-slate-200">
              <div className="font-semibold text-cyan-100">ClearFlow Terms and Record Retention</div>
              <div className="mt-2 leading-6 text-slate-300">
                Core workspace data for Google users can remain user-owned through Google Drive where available. ClearFlow still retains required platform records, including the user agreement, internal security agreement support, and the internal deposit ledger for protected security instruments held in custody or retention.
              </div>
              <div className="mt-4">
                <label htmlFor="signerName" className="block text-sm font-medium text-slate-300">
                  Signer Name
                </label>
                <input
                  id="signerName"
                  name="signerName"
                  type="text"
                  value={form.signerName}
                  onChange={handleChange}
                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                  placeholder="Type your full name to sign"
                  required
                />
              </div>
              <label className="mt-3 flex items-start gap-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  name="acceptedTerms"
                  checked={form.acceptedTerms}
                  onChange={(event) =>
                    setForm({ ...form, acceptedTerms: event.target.checked })
                  }
                  className="mt-1"
                  required
                />
                <span>
                  I agree to ClearFlow&apos;s terms and conditions, authorize the creation of a retained security agreement record, and understand that required platform custody and compliance records may be retained by ClearFlow.
                </span>
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            At least one contact method is required. Google remains the primary sign-in path for this workspace.
          </p>
          <button
            type="submit"
            disabled={!form.name || (!form.email && !form.phone) || !form.acceptedTerms || !form.signerName}
            className="w-full mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-slate-500"
          >
            Sign and Submit
          </button>
        </form>
      </div>
    </div>
  );
};
