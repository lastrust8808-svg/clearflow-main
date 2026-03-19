import React from 'react';
import { SystemStatus } from '../../types/app.models';

interface SystemStatusCardProps {
  status: SystemStatus;
}

const statusClasses = {
  online: { card: 'bg-emerald-900/40 border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300' },
  degraded: { card: 'bg-amber-900/40 border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300' },
  offline: { card: 'bg-red-900/40 border-red-500/30', badge: 'bg-red-500/20 text-red-300' }
};

export const SystemStatusCard: React.FC<SystemStatusCardProps> = ({ status }) => {
  const classes = statusClasses[status.status];
  return (
    <div className={`p-4 rounded-lg border h-full ${classes.card}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-200">{status.serviceName}</h4>
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${classes.badge}`}>
          {status.status}
        </span>
      </div>
      <p className="text-sm text-slate-400 mt-2">{status.details}</p>
    </div>
  );
};