import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { PlaidConnectionPayload } from '../../types/app.models';
import { plaidService } from '../../services/plaid.service';
import { useAuth } from '../../hooks/useAuth';

interface PlaidLinkModalProps {
  onClose: () => void;
  onConnected: (payload: PlaidConnectionPayload) => void;
}

export const PlaidLinkModal: React.FC<PlaidLinkModalProps> = ({ onClose, onConnected }) => {
  const { currentUser } = useAuth();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isMockMode = !!linkToken?.startsWith('link-sandbox-mock-');

  useEffect(() => {
    const createToken = async () => {
      if (!currentUser) {
        setError("User not authenticated.");
        return;
      }
      try {
        const { link_token } = await plaidService.createLinkToken(currentUser.id);
        setLinkToken(link_token);
      } catch (err) {
        setError("Could not create a Plaid Link token. Please try again later.");
        console.error(err);
      }
    };
    createToken();
  }, [currentUser]);

  const onSuccess = useCallback(async (public_token: string) => {
    if (!currentUser) return;
    setIsProcessing(true);
    try {
      const payload = await plaidService.exchangePublicToken(public_token, currentUser.id, currentUser.name);
      onConnected(payload);
    } catch (err) {
      setError("Failed to connect your bank account. Please try again.");
      console.error(err);
      setIsProcessing(false);
    }
  }, [currentUser, onConnected]);

  const handleMockConnect = useCallback(async () => {
    await onSuccess(`public-sandbox-mock-${Date.now()}`);
  }, [onSuccess]);

  const { open, ready } = usePlaidLink({
    token: isMockMode ? null : linkToken,
    onSuccess,
    onExit: (err, metadata) => {
      if (err) {
        console.error("Plaid Link exit with error:", err, metadata);
      }
      if (!isProcessing) { // Don't close if we are already processing the success
         onClose();
      }
    },
  });

  const renderContent = () => {
    if (error) {
        return (
             <div className="text-center py-8">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 <h3 className="mt-3 text-lg font-semibold text-red-300">Connection Failed</h3>
                 <p className="text-sm text-slate-400 mt-2">{error}</p>
                 <button onClick={onClose} className="w-full mt-6 py-2 bg-slate-600 text-white font-semibold rounded-md hover:bg-slate-700">Close</button>
             </div>
        );
    }

    if (isProcessing) {
        return (
             <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400"></div>
                <p className="mt-4 font-semibold text-slate-300">Securing Connection...</p>
                <p className="text-sm text-slate-400">Please wait while we finalize your account connection.</p>
            </div>
        );
    }

    if (isMockMode) {
      return (
        <>
          <p className="text-sm text-slate-400 mb-6">
            The production Plaid backend is not configured in this environment yet, so ClearFlow
            will create a live-ready mock connection. That lets you test the operational ledger,
            bank-feed rules, and auto-reconcile flow right now without blocking the build path.
          </p>
          <button
            onClick={handleMockConnect}
            className="w-full py-3 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700"
          >
            Connect Demo Bank Feed
          </button>
        </>
      );
    }

    return (
        <>
            <p className="text-sm text-slate-400 mb-6">Clear-Flow uses Plaid to securely connect your financial accounts. Plaid is a financial technology company that enables applications to connect with users' bank accounts.</p>
            <button
                onClick={() => open()}
                disabled={!ready}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-slate-500 disabled:cursor-wait"
            >
                {!ready ? 'Loading...' : 'Continue to Plaid'}
            </button>
            <p className="text-xs text-slate-500 text-center mt-4">By selecting 'Continue', you agree to the Plaid <a href="https://plaid.com/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">End User Privacy Policy</a>.</p>
        </>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 w-full max-w-md rounded-lg shadow-2xl border border-slate-700">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Connect Your Bank</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white disabled:opacity-50" disabled={isProcessing}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
