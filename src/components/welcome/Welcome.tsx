import React from 'react';
import { Logo } from '../logo/Logo';

interface WelcomeProps {
  isConfigured: boolean;
  onDevLogin: () => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ isConfigured, onDevLogin }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
          <div className="flex justify-center">
            <Logo height={64} />
          </div>

          <div className="mt-6 text-center">
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              Welcome to Clear-Flow
            </h1>
            <p className="mt-3 text-base text-slate-300">
              Integrated Financial Management
            </p>
            <p className="mt-6 text-sm leading-6 text-slate-400">
              Sign in with Google to restore your session or create a new, secure account.
            </p>
          </div>

          <div className="mt-8 flex justify-center">
            <div id="google-btn-container" className="min-h-[44px]" />
          </div>

          {!isConfigured && (
            <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
              Google sign-in is not configured yet. Use dev login for local testing.
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={onDevLogin}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              Dev Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};