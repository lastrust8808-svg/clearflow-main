import React from 'react';
import { Logo } from '../logo/Logo';

interface ConfigurationNeededProps {
  onDevLogin: () => void;
}

const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre className="bg-slate-900/70 p-3 rounded-md border border-slate-700 text-xs text-slate-300 font-mono whitespace-pre-wrap">
    <code>{children}</code>
  </pre>
);

export const ConfigurationNeeded: React.FC<ConfigurationNeededProps> = ({ onDevLogin }) => {
  return (
    <div className="p-8 bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700 w-full max-w-4xl text-left">
      <div className="flex justify-center mb-4"><Logo height={50} /></div>
      <h1 className="text-2xl font-bold text-amber-300 text-center">Configuration Needed for Live Mode</h1>
      <p className="text-slate-400 mt-2 text-center mb-8">
        To enable persistent user accounts and connect to Plaid, you need to provide a few keys.
      </p>

      <div className="space-y-6">
        {/* Step 1: Frontend */}
        <div>
          <h2 className="text-lg font-semibold text-blue-300 border-b border-slate-600 pb-2 mb-3">1. Frontend: Configure Google Sign-In</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2">
            <li>Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a>.</li>
            <li>Create an "OAuth 2.0 Client ID" for a "Web application".</li>
            <li>Under "Authorized JavaScript origins", add your app's URL (e.g., `{window.location.origin}`).</li>
            <li>Copy the generated "Client ID".</li>
            <li>In the AI Studio Build menu, go to **Settings** and add `VITE_GOOGLE_CLIENT_ID` with your Client ID.</li>
          </ol>
          <div className="mt-3">
            <CodeBlock>
{`# File: .env.example
VITE_GOOGLE_CLIENT_ID=PASTE_YOUR_CLIENT_ID_HERE
VITE_API_BASE_URL=PASTE_YOUR_API_URL_HERE`}
            </CodeBlock>
          </div>
        </div>

        {/* Step 2: Backend */}
        <div>
          <h2 className="text-lg font-semibold text-blue-300 border-b border-slate-600 pb-2 mb-3">2. Backend: Configure Plaid Secrets</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2">
            <li>In your project's root directory, create a new file named `.env`.</li>
            <li>
              Add your Plaid API keys and desired server port to this file. Get your keys from the <a href="https://dashboard.plaid.com/team/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Plaid Dashboard</a>.
            </li>
          </ol>
           <div className="mt-3">
            <CodeBlock>
{`# File: .env
PORT=8000
PLAID_CLIENT_ID=YOUR_PLAID_CLIENT_ID
PLAID_SECRET=YOUR_PLAID_SANDBOX_SECRET
PLAID_ENV=sandbox
# This will be your ngrok URL from the next step
PLAID_WEBHOOK_URL=https://...ngrok-free.app/api/plaid/webhook`}
            </CodeBlock>
          </div>
        </div>

        {/* Step 3: Connect Frontend & Backend */}
        <div>
           <h2 className="text-lg font-semibold text-blue-300 border-b border-slate-600 pb-2 mb-3">3. Connect</h2>
            <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2">
              <li>In the AI Studio Build menu, go to **Settings**.</li>
              <li>Add `VITE_API_BASE_URL` with your backend's public URL (e.g., your ngrok URL).</li>
              <li>The app will automatically use these variables to connect.</li>
            </ol>
        </div>
      </div>
      
      {/* Dev Login as an alternative */}
      <div className="text-center mt-8 pt-6 border-t border-slate-700">
         <p className="text-slate-400 text-sm mb-4">Alternatively, you can use the developer sign-in for testing without data persistence.</p>
          <button
            onClick={onDevLogin}
            className="inline-flex items-center justify-center gap-3 w-[280px] bg-white text-slate-700 font-semibold py-2 px-4 rounded-md border border-slate-300 hover:bg-slate-50"
            type="button"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 0 48 48"><g><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></g></svg>
            <span>Sign in with Google (Dev)</span>
          </button>
      </div>
    </div>
  );
};
