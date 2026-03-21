import React, { useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const ProfileSetup: React.FC = () => {
  const auth = useAuth();
  const [form, setForm] = useState({
    name: auth.currentUser?.name ?? '',
    email: auth.currentUser?.email ?? '',
    phone: auth.currentUser?.phone ?? '',
    userHandle: auth.currentUser?.userHandle ?? '',
    password: '',
  });

  const requiresBackupFields = auth.isLocalCredentialFlow;
  const suggestedHandle = useMemo(() => {
    if (form.userHandle.trim()) {
      return form.userHandle.trim();
    }

    if (form.email.includes('@')) {
      return form.email.split('@')[0].toLowerCase();
    }

    return form.name.trim().toLowerCase().replace(/\s+/g, '.');
  }, [form.email, form.name, form.userHandle]);

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
        requiresBackupFields ? suggestedHandle || undefined : undefined,
        requiresBackupFields && form.password.trim() ? form.password : undefined
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
            {requiresBackupFields ? (
              <>
                <div>
                  <label htmlFor="userHandle" className="block text-sm font-medium text-slate-400">
                    User ID
                  </label>
                  <input
                    id="userHandle"
                    name="userHandle"
                    type="text"
                    value={form.userHandle}
                    onChange={handleChange}
                    placeholder={suggestedHandle || 'your.userid'}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-400">
                    Backup Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Set a password for backup sign-in"
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                  />
                </div>
              </>
            ) : null}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            At least one contact method is required.
            {requiresBackupFields
              ? ' Add a user ID and password now if you want backup sign-in beyond Google.'
              : ''}
          </p>
          <button
            type="submit"
            disabled={!form.name || (!form.email && !form.phone)}
            className="w-full mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-slate-500"
          >
            Confirm and Enter
          </button>
        </form>
      </div>
    </div>
  );
};
