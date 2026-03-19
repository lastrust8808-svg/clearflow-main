import React from 'react';

export type OnboardingPath =
  | 'trust_estate'
  | 'business_entity'
  | 'tax_exempt'
  | 'private_membership'
  | 'personal'
  | 'other_custom';

interface OnboardingPathSelectProps {
  onBack: () => void;
  onSelectPath: (path: OnboardingPath) => void;
}

const pathCards: {
  id: OnboardingPath;
  title: string;
  description: string;
  badge: string;
}[] = [
  {
    id: 'trust_estate',
    title: 'Trust / Estate',
    description:
      'Onboarding for trustees, fiduciaries, estate administrators, and protected trust-based structures.',
    badge: 'Fiduciary',
  },
  {
    id: 'business_entity',
    title: 'Business Entity',
    description:
      'Structured intake for LLCs, corporations, holdings, and operating entities requiring EIN and authority verification.',
    badge: 'Entity',
  },
  {
    id: 'tax_exempt',
    title: 'Tax-Exempt',
    description:
      'Enhanced onboarding for exempt structures with stricter recordkeeping, contributions, assigned assets, and reporting expectations.',
    badge: 'Restricted',
  },
  {
    id: 'private_membership',
    title: 'Private Membership / PMA',
    description:
      'Entry path for private membership associations and member-administered structures needing controlled access.',
    badge: 'Private',
  },
  {
    id: 'personal',
    title: 'Personal',
    description:
      'Individual onboarding for private record organization, financial intake, and non-entity workspace access.',
    badge: 'Individual',
  },
  {
    id: 'other_custom',
    title: 'Other / Custom Intake',
    description:
      'For structures that do not fit the standard paths and need custom intake review.',
    badge: 'Custom',
  },
];

export const OnboardingPathSelect: React.FC<OnboardingPathSelectProps> = ({
  onBack,
  onSelectPath,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              New Client Onboarding
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
              Select the entity type to onboard
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              Choose the structure that best matches the entity or account being onboarded.
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

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pathCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectPath(card.id)}
              className="w-full rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-left shadow-lg transition hover:border-cyan-400/30 hover:bg-slate-900 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xl font-semibold text-white">{card.title}</div>
                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-200">
                  {card.badge}
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-400">
                {card.description}
              </p>

              <div className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Tap to continue
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};