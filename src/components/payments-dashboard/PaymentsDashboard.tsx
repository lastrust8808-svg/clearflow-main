import React, { useMemo } from 'react';
import { Entity, Payment, PaymentStatus } from '../../types/app.models';

interface PaymentsDashboardProps {
  entities: Entity[];
  onNewPaymentClick: () => void;
  onNewInternalTransferClick: () => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const getStatusPillClass = (status: PaymentStatus) => {
  const styles: Record<PaymentStatus, string> = {
    pending: 'bg-amber-500/20 text-amber-300',
    settled: 'bg-emerald-500/20 text-emerald-300',
    returned: 'bg-red-500/20 text-red-300',
    failed: 'bg-red-500/20 text-red-300',
    review: 'bg-sky-500/20 text-sky-300',
  };
  return styles[status] || 'bg-slate-700 text-slate-300';
};


export const PaymentsDashboard: React.FC<PaymentsDashboardProps> = ({ entities, onNewPaymentClick, onNewInternalTransferClick }) => {
  const allPayments = useMemo(() => {
    return entities.flatMap(entity => 
      (entity.payments || []).map(payment => ({ ...payment, entityName: entity.name }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entities]);

  const connectedAccountsCount = useMemo(() => entities.filter(e => e.bankConnected).length, [entities]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-slate-400 text-sm mb-6 max-w-3xl">Initiate external payments, transfer funds between your entities, and view transaction history. All outgoing external payments are screened for risk using Plaid Signal.</p>
        </div>
        <div className="flex-shrink-0 flex gap-3">
          <button 
            onClick={onNewInternalTransferClick} 
            disabled={connectedAccountsCount < 2}
            className="px-5 py-2 bg-purple-600 text-white font-semibold rounded-md text-sm hover:bg-purple-700 whitespace-nowrap disabled:bg-slate-500 disabled:cursor-not-allowed"
            title={connectedAccountsCount < 2 ? "Requires at least two connected accounts" : "Transfer between your accounts"}
          >
            + New Internal Transfer
          </button>
          <button 
            onClick={onNewPaymentClick} 
            disabled={connectedAccountsCount < 1}
            className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-md text-sm hover:bg-blue-700 whitespace-nowrap disabled:bg-slate-500 disabled:cursor-not-allowed"
            title={connectedAccountsCount < 1 ? "Requires at least one connected account" : "Send an external payment"}
          >
            + New External Payment
          </button>
        </div>
      </div>
      
      <div className="bg-slate-800/50 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-300 p-4 border-b border-slate-700">Payment History</h3>
        {allPayments.length === 0 ? (
          <div className="text-center py-16">
            <h3 className="text-lg text-slate-400">No payments found.</h3>
            <p className="text-slate-500 mt-1 text-sm">Initiate a new payment to see its history here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900/70">
                <tr className="border-b border-slate-600">
                  <th className="text-left p-3 font-semibold">Initiated</th>
                  <th className="text-left p-3 font-semibold">Settlement</th>
                  <th className="text-left p-3 font-semibold">Entity</th>
                  <th className="text-left p-3 font-semibold">Direction</th>
                  <th className="text-left p-3 font-semibold">Party</th>
                  <th className="text-right p-3 font-semibold">Amount</th>
                  <th className="text-center p-3 font-semibold">Rail</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                  <th className="text-center p-3 font-semibold">Signal</th>
                </tr>
              </thead>
              <tbody>
                {allPayments.map(payment => (
                  <tr key={payment.id} className="border-b border-slate-800">
                    <td className="p-3 whitespace-nowrap">{payment.date}</td>
                    <td className="p-3 whitespace-nowrap">{payment.settlementDate || <span className="text-slate-500">Pending</span>}</td>
                    <td className="p-3 font-medium">{payment.entityName}</td>
                    <td className="p-3 capitalize">
                       <span className={payment.direction === 'outgoing' ? 'text-red-400' : 'text-emerald-400'}>
                         {payment.direction}
                       </span>
                    </td>
                    <td className="p-3">{payment.partyName}</td>
                    <td className="p-3 text-right font-mono">{currencyFormatter.format(payment.amount)}</td>
                    <td className="p-3 text-center capitalize">{payment.rail}</td>
                    <td className="p-3 text-center">
                       <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${getStatusPillClass(payment.status)}`}>{payment.status}</span>
                    </td>
                    <td className="p-3 text-center">
                       <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                         payment.signalDecision === 'ACCEPT' ? 'bg-emerald-500/20 text-emerald-300' :
                         payment.signalDecision === 'REROUTE' ? 'bg-amber-500/20 text-amber-300' :
                         payment.signalDecision === 'REVIEW' ? 'bg-sky-500/20 text-sky-300' :
                         'bg-slate-700 text-slate-400'
                       }`}>
                         {payment.signalDecision}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
