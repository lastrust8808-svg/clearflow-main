import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { WealthMandateProfile } from '../../types/app.models';

export const ProfileSetup: React.FC = () => {
  const auth = useAuth();
  const hasAcceptedTerms = Boolean(auth.currentUser?.clearflowTermsAcceptedAt);
  const [form, setForm] = useState({
    name: auth.currentUser?.name ?? '',
    email: auth.currentUser?.email ?? '',
    phone: auth.currentUser?.phone ?? '',
    acceptedTerms: hasAcceptedTerms,
    signerName:
      auth.currentUser?.clearflowTermsSignerName ||
      auth.currentUser?.name ||
      '',
    wealthObjective:
      auth.currentUser?.wealthMandate?.objective ?? 'balanced_growth',
    liquidityPreference:
      auth.currentUser?.wealthMandate?.liquidityPreference ?? 'balanced',
    riskTolerance:
      auth.currentUser?.wealthMandate?.riskTolerance ?? 'moderate',
    timeHorizon:
      auth.currentUser?.wealthMandate?.timeHorizon ?? 'medium',
    wealthNotes: auth.currentUser?.wealthMandate?.notes ?? '',
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name: auth.currentUser?.name ?? current.name,
      email: auth.currentUser?.email ?? current.email,
      phone: auth.currentUser?.phone ?? current.phone,
      acceptedTerms: Boolean(auth.currentUser?.clearflowTermsAcceptedAt) || current.acceptedTerms,
      signerName:
        auth.currentUser?.clearflowTermsSignerName ||
        auth.currentUser?.name ||
        current.signerName,
      wealthObjective:
        auth.currentUser?.wealthMandate?.objective ?? current.wealthObjective,
      liquidityPreference:
        auth.currentUser?.wealthMandate?.liquidityPreference ?? current.liquidityPreference,
      riskTolerance:
        auth.currentUser?.wealthMandate?.riskTolerance ?? current.riskTolerance,
      timeHorizon:
        auth.currentUser?.wealthMandate?.timeHorizon ?? current.timeHorizon,
      wealthNotes: auth.currentUser?.wealthMandate?.notes ?? current.wealthNotes,
    }));
  }, [
    auth.currentUser?.clearflowTermsAcceptedAt,
    auth.currentUser?.clearflowTermsSignerName,
    auth.currentUser?.email,
    auth.currentUser?.wealthMandate?.liquidityPreference,
    auth.currentUser?.wealthMandate?.notes,
    auth.currentUser?.wealthMandate?.objective,
    auth.currentUser?.wealthMandate?.riskTolerance,
    auth.currentUser?.wealthMandate?.timeHorizon,
    auth.currentUser?.name,
    auth.currentUser?.phone,
  ]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name && (form.email || form.phone)) {
      const wealthMandate: WealthMandateProfile = {
        enabled: true,
        objective: form.wealthObjective as WealthMandateProfile['objective'],
        liquidityPreference:
          form.liquidityPreference as WealthMandateProfile['liquidityPreference'],
        riskTolerance: form.riskTolerance as WealthMandateProfile['riskTolerance'],
        timeHorizon: form.timeHorizon as WealthMandateProfile['timeHorizon'],
        notes: form.wealthNotes || undefined,
        activatedAt:
          auth.currentUser?.wealthMandate?.activatedAt || new Date().toISOString(),
      };
      auth.completeProfileSetup(
        form.name,
        form.email || undefined,
        form.phone || undefined,
        undefined,
        undefined,
        form.acceptedTerms,
        form.signerName || form.name,
        wealthMandate
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
            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-slate-200">
              <div className="font-semibold text-amber-100">AI Wealth Manager Mandate</div>
              <div className="mt-2 leading-6 text-slate-300">
                Set your default wealth posture once so ClearFlow can tailor liquidity,
                reserve, trust-funding, collateral, and liquidation guidance across your
                entities.
              </div>
              <div className="mt-4 grid gap-4">
                <div>
                  <label htmlFor="wealthObjective" className="block text-sm font-medium text-slate-300">
                    Primary Objective
                  </label>
                  <select
                    id="wealthObjective"
                    name="wealthObjective"
                    value={form.wealthObjective}
                    onChange={handleChange}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                  >
                    <option value="preservation">Preservation</option>
                    <option value="balanced_growth">Balanced Growth</option>
                    <option value="income">Income</option>
                    <option value="opportunistic">Opportunistic</option>
                    <option value="fiduciary_stability">Fiduciary Stability</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="liquidityPreference" className="block text-sm font-medium text-slate-300">
                      Liquidity
                    </label>
                    <select
                      id="liquidityPreference"
                      name="liquidityPreference"
                      value={form.liquidityPreference}
                      onChange={handleChange}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                    >
                      <option value="high">High</option>
                      <option value="balanced">Balanced</option>
                      <option value="long_horizon">Long Horizon</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="riskTolerance" className="block text-sm font-medium text-slate-300">
                      Risk
                    </label>
                    <select
                      id="riskTolerance"
                      name="riskTolerance"
                      value={form.riskTolerance}
                      onChange={handleChange}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                    >
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="elevated">Elevated</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="timeHorizon" className="block text-sm font-medium text-slate-300">
                      Horizon
                    </label>
                    <select
                      id="timeHorizon"
                      name="timeHorizon"
                      value={form.timeHorizon}
                      onChange={handleChange}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                    >
                      <option value="short">Short</option>
                      <option value="medium">Medium</option>
                      <option value="long">Long</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="wealthNotes" className="block text-sm font-medium text-slate-300">
                    Wealth Notes
                  </label>
                  <textarea
                    id="wealthNotes"
                    name="wealthNotes"
                    value={form.wealthNotes}
                    onChange={handleChange}
                    rows={3}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2"
                    placeholder="Example: keep trusts liquid, use metals as collateral before sale, preserve principal, emphasize income."
                  />
                </div>
              </div>
            </div>
            <div className="rounded-md border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-slate-200">
              <div className="font-semibold text-cyan-100">ClearFlow Terms and Record Retention</div>
              <div className="mt-2 leading-6 text-slate-300">
                Core workspace data for Google users can remain user-owned through Google Drive where available. ClearFlow still retains required platform records, including the user agreement, retained security support, and related compliance or custody records needed for platform operation. By continuing, you represent that you will only establish or operate entities in ClearFlow when you are their lawful owner, officer, manager, trustee, administrator, fiduciary, or otherwise authorized representative.
              </div>
              {hasAcceptedTerms ? (
                <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  Terms already accepted and retained by ClearFlow on {new Date(auth.currentUser?.clearflowTermsAcceptedAt || '').toLocaleString()}.
                </div>
              ) : null}
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
                  disabled={hasAcceptedTerms}
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
                  disabled={hasAcceptedTerms}
                />
                <span>
                  {hasAcceptedTerms
                    ? 'Your ClearFlow terms acceptance is already on file. Review your profile details and continue into the workspace.'
                    : 'I agree to ClearFlow&apos;s terms and conditions, authorize the creation of required retained platform records, understand that ClearFlow may keep custody, compliance, and agreement-support records where required for platform operation, and represent that I will only add or operate entities for which I have the legal authority to act.'}
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
            {hasAcceptedTerms ? 'Continue to Workspace' : 'Sign and Submit'}
          </button>
        </form>
      </div>
    </div>
  );
};
