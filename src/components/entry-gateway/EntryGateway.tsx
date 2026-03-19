import React from 'react';
import { Logo } from '../logo/Logo';

type EntryGatewayProps = {
  onNewClient: () => void;
  onExistingClient: () => void;
};

export const EntryGateway: React.FC<EntryGatewayProps> = ({
  onNewClient,
  onExistingClient,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex items-center justify-center lg:justify-start">
          <Logo height={56} />
        </div>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300">
                Private Client Environment
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                Private Structure.
                <br />
                Clear Control.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Enter a secure operating environment for structured onboarding,
                entity management, and guided client access.
              </p>

              <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2">
                  Structured Onboarding
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2">
                  Secure Access
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2">
                  Guided Workflows
                </span>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl shadow-black/40 sm:p-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
                  <div className="mb-6">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                      Access Path
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      Choose how you want to enter
                    </h2>
                  </div>

                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={onNewClient}
                      className="group w-full rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 p-5 text-left transition hover:border-cyan-400/40 hover:from-cyan-500/20 hover:to-blue-500/20"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-white">New Client</div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">
                            Begin onboarding, select your entity type, and move into membership establishment.
                          </div>
                        </div>
                        <div className="shrink-0 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-cyan-300">
                          New
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={onExistingClient}
                      className="group w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-5 text-left transition hover:border-slate-500 hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-white">Existing Client</div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">
                            Access your portal using your current login or secure Google sign-in.
                          </div>
                        </div>
                        <div className="shrink-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-300">
                          Login
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="mt-6 border-t border-slate-800 pt-5 text-sm text-slate-400">
                    Designed for secure onboarding, private client access, and professionally structured workflows across web and mobile.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-900 pt-4 text-center text-[11px] uppercase tracking-[0.18em] text-slate-500">
          Structured Onboarding · Secure Access · Guided Workflows
        </div>
      </div>
    </div>
  );
};
