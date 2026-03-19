import React from 'react';

interface FundingRailsProps {
  onBack: () => void;
}

interface RailInfo {
  title: string;
  description: string;
  whatItsFor: string;
  speed: string;
  keyTrait: string;
}

interface RailCategory {
  categoryTitle: string;
  rails: RailInfo[];
}

const railCategories: RailCategory[] = [
  {
    categoryTitle: "Bank-to-Bank Rails",
    rails: [
      {
        title: "ACH (Automated Clearing House)",
        description: "The backbone for most 'bank transfer' funding in the U.S., operating on a batch-processing system for both debits (pulls) and credits (pushes).",
        whatItsFor: "Payroll, bill pay, subscriptions, funding investment accounts, and other recurring or non-urgent transfers.",
        speed: "Next-day or 1-3 business days. Same Day ACH is faster within business hours.",
        keyTrait: "Reversible. Subject to returns for various reasons (e.g., insufficient funds), which necessitates risk management.",
      },
      {
        title: "Wire Transfers (Fedwire & CHIPS)",
        description: "Real-time gross settlement (RTGS) systems for high-value, time-sensitive payments that require strong finality.",
        whatItsFor: "Real estate closings, large B2B payments, treasury management, and funding escrow accounts.",
        speed: "Settles same-day during business hours.",
        keyTrait: "Finality. Wires are generally considered final and irrevocable once processed, offering high payment assurance.",
      },
      {
        title: "Instant Payments (RTP® & FedNow®)",
        description: "Modern 24/7/365 'push' credit transfer networks that provide immediate clearing and settlement between participating institutions.",
        whatItsFor: "Instant disbursements, P2P payments, real-time merchant payments, and 'instant payroll' use cases.",
        speed: "Near real-time, typically within seconds.",
        keyTrait: "Irreversible. Transactions are final, providing immediate funds availability with no chargeback risk.",
      },
    ]
  },
  {
    categoryTitle: "Card-Network Rails",
    rails: [
       {
        title: "Card Purchase Rails",
        description: "The standard networks (Visa, Mastercard, etc.) for processing debit and credit card payments at the point of sale, both online and in-person.",
        whatItsFor: "Consumer checkout, online shopping, subscriptions, and any scenario requiring broad, instant payment acceptance.",
        speed: "Authorization is instant; settlement between merchants and banks happens in batches later.",
        keyTrait: "Reversible. Subject to a well-established chargeback and dispute process for consumer protection.",
      },
      {
        title: "Push-to-Card (Visa Direct / Mastercard Send)",
        description: "Allows for funds to be sent directly (pushed) to an eligible debit or prepaid card, bypassing traditional bank account details.",
        whatItsFor: "Gig economy payouts, insurance disbursements, refunds, and earned wage access.",
        speed: "Near real-time, often within minutes.",
        keyTrait: "Controlled Reversibility. More final than purchases, but still governed by card network rules.",
      },
    ]
  },
  {
    categoryTitle: "Paper & Legacy Rails",
    rails: [
      {
        title: "Checks",
        description: "A legacy paper-based (or image-based via RDC) system that remains a common method for B2B and some consumer payments.",
        whatItsFor: "Vendor payments, rent, and other traditional business-to-business workflows.",
        speed: "Slow. Subject to mail time, processing holds, and multi-day clearing cycles.",
        keyTrait: "Reversible. Can be cancelled with a 'stop payment' and is subject to returns for issues like insufficient funds.",
      },
      {
        title: "Cash",
        description: "Physical currency used for in-person transactions and deposits. Digital integration requires a partner network.",
        whatItsFor: "In-person deposits at retail locations or ATMs that are part of a cash-in network.",
        speed: "Availability depends on the partner network's processing time.",
        keyTrait: "High Friction. Operationally complex to integrate into software products; relies on physical infrastructure.",
      },
    ]
  },
   {
    categoryTitle: "Internal & Cross-Border Rails",
    rails: [
      {
        title: "Internal Ledger (Book Transfer)",
        description: "A closed-loop system for moving value between accounts within a single platform (like Clear-Flow). It's instant and efficient.",
        whatItsFor: "Transfers between users on the same platform, in-app balances, and internal treasury movements.",
        speed: "Instantaneous.",
        keyTrait: "Platform-Controlled. Reversibility and rules are determined entirely by the platform's own policies.",
      },
      {
        title: "SWIFT (International)",
        description: "A secure messaging network used by banks globally for cross-border payment instructions. SWIFT itself doesn't move funds.",
        whatItsFor: "International wires and cross-border trade finance.",
        speed: "Slow. Can take multiple days to settle through chains of correspondent banks.",
        keyTrait: "Messaging, not Settlement. Relies on correspondent banking relationships, adding complexity and fees.",
      },
    ]
  }
];

const InfoItem: React.FC<{ icon: React.ReactNode; label: string; value: string; }> = ({ icon, label, value }) => (
  <div className="flex items-start">
    <div className="flex-shrink-0 w-6 h-6 text-slate-400 mt-0.5">{icon}</div>
    <div className="ml-2">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  </div>
);

export const FundingRails: React.FC<FundingRailsProps> = ({ onBack }) => {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-semibold mb-1 text-white">Funding Rails Explained</h2>
          <p className="text-slate-400 max-w-3xl">Funding rails are the payment networks used to move money. The choice of rail depends on speed, cost, finality, and use case.</p>
        </div>
        <button onClick={onBack} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md whitespace-nowrap">Back to Dashboard</button>
      </div>

      <div className="space-y-10">
        {railCategories.map(category => (
          <section key={category.categoryTitle}>
            <div className="border-b border-slate-700 pb-2 mb-6">
              <h2 className="text-2xl font-semibold text-white">{category.categoryTitle}</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {category.rails.map(rail => (
                <div key={rail.title} className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 flex flex-col h-full transition-all duration-300 hover:border-blue-400/50 hover:shadow-blue-500/10 hover:-translate-y-1">
                  <h3 className="text-lg font-semibold text-blue-300">{rail.title}</h3>
                  <p className="text-sm text-slate-400 mt-2 mb-4 flex-grow">{rail.description}</p>
                  <div className="space-y-3 border-t border-slate-700 pt-4">
                    <InfoItem 
                      label="What it's for" 
                      value={rail.whatItsFor}
                      icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
                    />
                    <InfoItem 
                      label="Speed" 
                      value={rail.speed}
                      icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>}
                    />
                    <InfoItem 
                      label="Key Trait" 
                      value={rail.keyTrait}
                      icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001a7.5 7.5 0 0 1-1.08 3.904l-2.138 3.013a7.5 7.5 0 0 1-12.639.001l-2.138-3.013a7.5 7.5 0 0 1-1.08-3.904h4.992v.001a.75.75 0 0 0 .75.75h3.496a.75.75 0 0 0 .75-.75v-.001Z" /></svg>}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};