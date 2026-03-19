import React, { useMemo, useState } from 'react';
import {
  saveOnboardingDraft,
  uploadOnboardingFile,
  submitOnboardingDraft,
  type MembershipIntakeDraft,
  type OnboardingPath,
} from '../../services/onboarding.service';

const STORAGE_KEY = 'clearflow-membership-intake-draft';
const STORAGE_ID_KEY = 'clearflow-membership-intake-draft-id';

export const clearStoredMembershipDraft = () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_ID_KEY);
};

interface MembershipEstablishmentProps {
  selectedPath: OnboardingPath;
  onBack: () => void;
  onContinueToLogin: (draft: MembershipIntakeDraft) => void;
}

const pathLabels: Record<OnboardingPath, string> = {
  trust_estate: 'Trust / Estate',
  business_entity: 'Business Entity',
  tax_exempt: 'Tax-Exempt',
  private_membership: 'Private Membership / PMA',
  personal: 'Personal',
  other_custom: 'Other / Custom Intake',
};

export const MembershipEstablishment: React.FC<MembershipEstablishmentProps> = ({
  selectedPath,
  onBack,
  onContinueToLogin,
}) => {
  const [form, setForm] = useState({
    legalName: '',
    displayName: '',
    ein: '',
    representativeName: '',
    representativeEmail: '',
    representativePhone: '',
    representativeRole: '',
    stateOfFormation: '',
    country: 'United States',
    authorizedRepresentative: false,
    googleIdentityMatch: false,
    trustType: '',
    exemptClassification: '',
    acceptsDonations: false,
    acceptsAssignedAssets: false,
    notes: '',
  });

  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const requiresEin = selectedPath !== 'personal';

  const pathSummary = useMemo(() => {
    switch (selectedPath) {
      case 'trust_estate':
        return 'Collect trustee or fiduciary identity, trust naming, supporting records, and authority to act.';
      case 'business_entity':
        return 'Collect entity identity, EIN, representative title, and authorization to act for the company.';
      case 'tax_exempt':
        return 'Collect exempt structure information, EIN, contribution and assignment handling, and stricter reporting intake.';
      case 'private_membership':
        return 'Collect organizer or steward details, structure information, and controlled-access administration data.';
      case 'personal':
        return 'Collect individual identity and account intake details without entity-EIN requirements.';
      case 'other_custom':
      default:
        return 'Collect the closest available structure details for custom review and guided intake.';
    }
  }, [selectedPath]);

  const isFormReady =
    form.legalName.trim() &&
    form.representativeName.trim() &&
    form.representativeEmail.trim() &&
    form.representativeRole.trim() &&
    form.authorizedRepresentative &&
    form.googleIdentityMatch &&
    (!requiresEin || form.ein.trim());

  const buildDraft = (): MembershipIntakeDraft => ({
    selectedPath,
    legalName: form.legalName,
    displayName: form.displayName,
    ein: form.ein,
    representativeName: form.representativeName,
    representativeEmail: form.representativeEmail,
    representativePhone: form.representativePhone,
    representativeRole: form.representativeRole,
    stateOfFormation: form.stateOfFormation,
    country: form.country,
    authorizedRepresentative: form.authorizedRepresentative,
    googleIdentityMatch: form.googleIdentityMatch,
    trustType: form.trustType,
    exemptClassification: form.exemptClassification,
    acceptsDonations: form.acceptsDonations,
    acceptsAssignedAssets: form.acceptsAssignedAssets,
    notes: form.notes,
  });

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSupportingFiles(files);
  };

  const handleContinue = async () => {
    if (!isFormReady) return;

    setIsSaving(true);
    setSaveError('');
    setSaveMessage('Saving onboarding draft...');

    try {
      const draft = buildDraft();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));

      const existingDraftId = localStorage.getItem(STORAGE_ID_KEY);
      const saved = await saveOnboardingDraft(draft, existingDraftId);
      const backendDraftId = saved.draft.id;

      localStorage.setItem(STORAGE_ID_KEY, backendDraftId);

      if (supportingFiles.length > 0) {
        setSaveMessage('Uploading supporting files...');
        for (const file of supportingFiles) {
          await uploadOnboardingFile(backendDraftId, file);
        }
      }

      setSaveMessage('Submitting onboarding draft...');
      await submitOnboardingDraft(backendDraftId);

      setSaveMessage('Draft saved. Continue to secure sign-in...');
      onContinueToLogin(draft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save onboarding draft.');
      setSaveMessage('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              Membership Establishment
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              {pathLabels[selectedPath]}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              {pathSummary}
            </p>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
          >
            Back
          </button>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Legal Entity / Account Name
                </label>
                <input
                  value={form.legalName}
                  onChange={(e) => update('legalName', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Enter the legal name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Display Name
                </label>
                <input
                  value={form.displayName}
                  onChange={(e) => update('displayName', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Optional working name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  State of Formation / Registration
                </label>
                <input
                  value={form.stateOfFormation}
                  onChange={(e) => update('stateOfFormation', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="State or jurisdiction"
                />
              </div>

              {requiresEin && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    EIN
                  </label>
                  <input
                    value={form.ein}
                    onChange={(e) => update('ein', e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="XX-XXXXXXX"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Country
                </label>
                <input
                  value={form.country}
                  onChange={(e) => update('country', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Country"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Representative Full Name
                </label>
                <input
                  value={form.representativeName}
                  onChange={(e) => update('representativeName', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Representative Email
                </label>
                <input
                  value={form.representativeEmail}
                  onChange={(e) => update('representativeEmail', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Email address"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Representative Phone
                </label>
                <input
                  value={form.representativePhone}
                  onChange={(e) => update('representativePhone', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Role / Title / Capacity
                </label>
                <input
                  value={form.representativeRole}
                  onChange={(e) => update('representativeRole', e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Trustee, Manager, Officer, Administrator, etc."
                />
              </div>

              {selectedPath === 'trust_estate' && (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Trust / Estate Type
                  </label>
                  <input
                    value={form.trustType}
                    onChange={(e) => update('trustType', e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Revocable, Irrevocable, Estate, Land Trust, etc."
                  />
                </div>
              )}

              {selectedPath === 'tax_exempt' && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Exempt Classification
                    </label>
                    <input
                      value={form.exemptClassification}
                      onChange={(e) => update('exemptClassification', e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                      placeholder="501(c), private foundation, ministry, etc."
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.acceptsDonations}
                          onChange={(e) => update('acceptsDonations', e.target.checked)}
                          className="mt-1"
                        />
                        <span>Entity will accept internal or external donations/contributions.</span>
                      </label>

                      <label className="flex items-start gap-3 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.acceptsAssignedAssets}
                          onChange={(e) => update('acceptsAssignedAssets', e.target.checked)}
                          className="mt-1"
                        />
                        <span>Entity may accept assignment of assets from related entities or internal structures.</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Supporting Records
                </label>
                <input
                  type="file"
                  multiple
                  onChange={handleFilesSelected}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
                {supportingFiles.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                    <div className="font-medium text-white">Selected files</div>
                    <ul className="mt-2 space-y-1">
                      {supportingFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`}>{file.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Notes / Membership Establishment Details
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Enter any additional structure details, supporting information, or onboarding notes."
                />
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="text-lg font-semibold text-white">Identity + Authority</h3>
              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.authorizedRepresentative}
                    onChange={(e) => update('authorizedRepresentative', e.target.checked)}
                    className="mt-1"
                  />
                  <span>I confirm that I am authorized to act for or represent this entity or account.</span>
                </label>

                <label className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.googleIdentityMatch}
                    onChange={(e) => update('googleIdentityMatch', e.target.checked)}
                    className="mt-1"
                  />
                  <span>I understand the login identity and onboarding identity should match for verification and security review.</span>
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-sm text-slate-400">Completion status</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {isFormReady ? 'Ready' : 'In Progress'}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Complete the intake details, confirm authority, and continue into secure sign-in to proceed.
              </p>

              {saveMessage && (
                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
                  {saveMessage}
                </div>
              )}

              {saveError && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {saveError}
                </div>
              )}

              <button
                type="button"
                onClick={handleContinue}
                disabled={!isFormReady || isSaving}
                className="mt-5 w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isSaving ? 'Saving...' : 'Continue to Secure Sign-In'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
