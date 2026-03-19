import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { geminiService } from '../../services/gemini.service';

type VerificationStep = 'upload' | 'processing' | 'verificationResult';

export const Verification: React.FC = () => {
  const auth = useAuth();
  const [step, setStep] = useState<VerificationStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      setSelectedFile(event.target.files[0]);
      setVerificationError(null);
    }
  };

  const submitForVerification = async () => {
    if (!selectedFile) return;
    setStep('processing');
    try {
      if (!geminiService.isConfigured) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Mock delay for dev
        setVerificationStatus('success');
      } else {
        const result = await geminiService.analyzeIdDocument(selectedFile);
        const extractedName = result.fullName.trim().toLowerCase();
        const registeredName = auth.currentUser?.name.trim().toLowerCase() ?? '';
        if (registeredName.split(' ').every(part => extractedName.includes(part))) {
          setVerificationStatus('success');
        } else {
          setVerificationStatus('failed');
          setVerificationError(`Name on ID ("${result.fullName}") does not match registered name ("${auth.currentUser?.name}").`);
        }
      }
    } catch (e) {
      setVerificationStatus('failed');
      setVerificationError(e instanceof Error ? e.message : 'An unknown error occurred.');
    } finally {
      setStep('verificationResult');
    }
  };

  const reset = () => {
    setStep('upload');
    setSelectedFile(null);
    setVerificationStatus('idle');
    setVerificationError(null);
  };
  
  const renderContent = () => {
    switch(step) {
      case 'upload':
        return (
          <>
            <h1 className="text-2xl font-bold text-slate-100 text-center">Verify Your Identity</h1>
            <p className="text-slate-400 mt-2 text-center mb-8">Please upload a government-issued photo ID to continue.</p>
            <div className="p-4 bg-slate-800 rounded-md border-2 border-dashed border-slate-600 text-center">
              {!selectedFile ? (
                <>
                  <svg className="mx-auto h-12 w-12 text-slate-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  <input id="id-upload" type="file" onChange={onFileSelected} accept="image/*" className="hidden" />
                  <label htmlFor="id-upload" className="mt-2 inline-block cursor-pointer px-4 py-2 bg-slate-700 text-white font-semibold rounded-md text-sm hover:bg-slate-600">Select Document</label>
                </>
              ) : (
                <div className="flex items-center justify-center text-slate-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <p className="font-medium truncate">{selectedFile.name}</p>
                </div>
              )}
            </div>
            {verificationError && <p className="text-red-400 text-sm mt-2">{verificationError}</p>}
            <button onClick={submitForVerification} disabled={!selectedFile} className="w-full mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-slate-500">Submit for Verification</button>
          </>
        );
      case 'processing':
        return (
          <div className="text-center">
            <h1 className="text-2xl font-bold">Processing Verification</h1>
            <p className="text-slate-400 mt-2">This should only take a moment.</p>
            <div className="mt-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            </div>
          </div>
        );
      case 'verificationResult':
        if (verificationStatus === 'success') {
          return (
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <h1 className="text-2xl font-bold mt-4">Verification Successful</h1>
              <p className="text-slate-400 mt-2">Your identity has been confirmed.</p>
              <button onClick={auth.completeVerification} className="w-full mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md">Go to Dashboard</button>
            </div>
          );
        }
        return ( // Failed status
           <div className="text-center">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h1 className="text-2xl font-bold mt-4">Verification Failed</h1>
            <p className="text-red-400 bg-red-900/30 p-3 rounded-md mt-4 text-sm">{verificationError || 'An unexpected error occurred.'}</p>
            <button onClick={reset} className="w-full mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md">Try Again</button>
          </div>
        );
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="p-8 bg-slate-800/50 rounded-lg shadow-2xl border border-slate-700 max-w-lg w-full">
        {renderContent()}
      </div>
    </div>
  );
};
