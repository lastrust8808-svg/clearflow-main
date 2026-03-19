import React, { useState } from 'react';
import { GOVERNANCE_DOCUMENTS, SECURITY_DOCUMENTS } from '../../data/governance-docs';

interface GovernanceDocsProps {
  onBack?: () => void;
  isModal?: boolean;
}

export const GovernanceDocs: React.FC<GovernanceDocsProps> = ({ onBack, isModal = false }) => {
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  const toggleAccordion = (key: string) => {
    setOpenAccordion(openAccordion === key ? null : key);
  };
  
  const content = (
    <>
      <section>
        <h3 className="text-xl font-semibold text-blue-400 mb-4 border-b border-slate-600 pb-2">Governance Documents</h3>
        <div className="space-y-4">
          {GOVERNANCE_DOCUMENTS.map((doc, i) => (
            <div key={doc.title} className="border border-slate-700 rounded-lg overflow-hidden">
              <button onClick={() => toggleAccordion(`gov-${i}`)} className="w-full flex justify-between items-center p-4 text-left bg-slate-800/60 hover:bg-slate-800/80">
                <span className="font-medium text-slate-200">{doc.title}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-400 transition-transform duration-300 ${openAccordion === `gov-${i}` ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
              <div className="overflow-hidden transition-all duration-500 ease-in-out" style={{ maxHeight: openAccordion === `gov-${i}` ? '10000px' : '0' }}>
                <div className="p-5 bg-slate-900/50">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{doc.content}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      
      <section className="mt-8">
        <h3 className="text-xl font-semibold text-blue-400 mb-4 border-b border-slate-600 pb-2">Security & Compliance Policies</h3>
        <div className="space-y-4">
          {SECURITY_DOCUMENTS.map((doc, i) => (
            <div key={doc.title} className="border border-slate-700 rounded-lg overflow-hidden">
              <button onClick={() => toggleAccordion(`sec-${i}`)} className="w-full flex justify-between items-center p-4 text-left bg-slate-800/60 hover:bg-slate-800/80">
                <span className="font-medium text-slate-200">{doc.title}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-400 transition-transform duration-300 ${openAccordion === `sec-${i}` ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
              <div className="overflow-hidden transition-all duration-500 ease-in-out" style={{ maxHeight: openAccordion === `sec-${i}` ? '10000px' : '0' }}>
                <div className="p-5 bg-slate-900/50">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{doc.content}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );

  if (isModal) {
    return content;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-slate-800/50 p-6 sm:p-8 rounded-lg border border-slate-700">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-3xl font-semibold mb-1 text-white">Policies & Agreements</h2>
            <p className="text-slate-400">The foundational charters, policies, and agreements for the company.</p>
          </div>
          {onBack && <button onClick={onBack} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md">Back to Dashboard</button>}
        </div>
        {content}
      </div>
    </div>
  );
};