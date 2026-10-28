import { bankingSession } from '../../services/storageSession.service';
import { isPlaidOAuthReturn, savePlaidLinkSession, readPlaidLinkSession, clearPlaidLinkSession, plaidReceivedRedirectUri } from '../../services/plaidOAuth.service';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { PlaidConnectionPayload } from '../../types/app.models';
import { plaidService } from '../../services/plaid.service';
import { useAuth } from '../../hooks/useAuth';

interface PlaidLinkModalProps {
  targetAccountId?: string | null;
  onClose: () => void;
  onConnected: (payload: PlaidConnectionPayload) => void;
}

export const PlaidLinkModal: React.FC<PlaidLinkModalProps> = ({ onClose, onConnected, targetAccountId = null }) => {
  const { currentUser } = useAuth();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const linkOwner = useRef<string | null>(null);
  const processing = useRef(false);

  const createToken = useCallback(async () => {
    if (!currentUser) {
      setError('User not authenticated.');
      return;
    }

    setError(null);
    setLinkToken(null);
    linkOwner.current = null;

    try {
      if (isPlaidOAuthReturn()) {
        const saved = readPlaidLinkSession(bankingSession().accountId);
        if (!saved) throw new Error('This bank connection session expired or belongs to another account. Close and start a new connection.');
        linkOwner.current = bankingSession().accountId;
        setLinkToken(saved.token);
        return;
      }
      const accountId = bankingSession().accountId;
      const { link_token } = await plaidService.createLinkToken(currentUser.id);
      if (bankingSession().accountId !== accountId) throw new Error('Account changed. Start a new bank connection.');
      savePlaidLinkSession(link_token, accountId, targetAccountId);
      linkOwner.current = accountId;
      setLinkToken(link_token);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create a Plaid Link token. Please try again later.'
      );
      console.error(err);
    }
  }, [currentUser, targetAccountId]);

  useEffect(() => {
    void createToken();
  }, [createToken]);

  const onSuccess = useCallback(async (public_token: string, metadata?: any) => {
    if (!currentUser) return;
    if (processing.current) return;
    try {
      if (!linkToken || !linkOwner.current || bankingSession().accountId !== linkOwner.current) {
        throw new Error('Bank connection session does not match the signed-in account.');
      }
      processing.current = true;
      setIsProcessing(true);
      const payload = await plaidService.exchangePublicToken(public_token, currentUser.id, currentUser.name);
      const payloadLinkedAccounts = payload.linkedAccounts ?? [];
      const payloadLinkedAccountMap = new Map(
        payloadLinkedAccounts.map((account) => [account.accountId, account])
      );
      const mergedLinkedAccounts =
        metadata?.accounts?.map((account: any) => {
          const accountId = account.id || account.account_id || '';
          const linkedPayloadAccount = payloadLinkedAccountMap.get(accountId);
          return {
            accountId,
            name:
              account.name ||
              account.official_name ||
              linkedPayloadAccount?.name ||
              'Connected account',
            mask: account.mask || linkedPayloadAccount?.mask || '',
            type: account.type || linkedPayloadAccount?.type || '',
            subtype: account.subtype || linkedPayloadAccount?.subtype || '',
            currentBalance: linkedPayloadAccount?.currentBalance,
            availableBalance: linkedPayloadAccount?.availableBalance,
          };
        }) || payload.linkedAccounts;
      if (bankingSession().accountId !== linkOwner.current) throw new Error('Account changed before connection completed.');
      clearPlaidLinkSession();
      onConnected({
        ...payload,
        institutionName: metadata?.institution?.name || payload.institutionName,
        linkedAccounts: mergedLinkedAccounts,
      });
    } catch (err) {
      setError("Failed to connect your bank account. Please try again.");
      console.error(err);
      processing.current = false;
      setIsProcessing(false);
    }
  }, [currentUser, onConnected, linkToken]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    ...(isPlaidOAuthReturn() ? { receivedRedirectUri: plaidReceivedRedirectUri() } : {}),
    onSuccess,
    onExit: (err, metadata) => {
      if (err) {
        console.error("Plaid Link exit with error:", err, metadata);
      }
      if (!processing.current) { // Success can precede React's next render.
         clearPlaidLinkSession();
         onClose();
      }
    },
  });

  useEffect(() => {
    if (ready && linkToken && linkOwner.current && isPlaidOAuthReturn()) open();
  }, [ready, open, linkToken]);

  const close = () => { clearPlaidLinkSession(); onClose(); };

  const renderContent = () => {
    if (error) {
        return (
             <div className="text-center py-8">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 <h3 className="mt-3 text-lg font-semibold text-red-300">Connection Failed</h3>
                 <p className="text-sm text-slate-400 mt-2">{error}</p>
                 <div className="mt-6 grid gap-3">
                   <button onClick={() => void createToken()} className="w-full py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700">
                     Retry Connection
                   </button>
                   <button onClick={close} className="w-full py-2 bg-slate-600 text-white font-semibold rounded-md hover:bg-slate-700">Close</button>
                 </div>
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
          <button onClick={close} className="text-slate-400 hover:text-white disabled:opacity-50" disabled={isProcessing}>
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
