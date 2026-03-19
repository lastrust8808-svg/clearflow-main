import React from 'react';
import { Entity } from '../../types/app.models';

interface EntityCardProps {
  entity: Entity;
  onViewDetail: (entity: Entity) => void;
  onDelete: (entity: Entity) => void;
}

export const EntityCard: React.FC<EntityCardProps> = ({ entity, onViewDetail, onDelete }) => {
  const isBusiness = entity.type !== 'Personal';

  return (
    <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-lg p-5 border border-slate-700 shadow-lg transition-all duration-300 hover:border-blue-400/50 hover:shadow-blue-500/10 hover:-translate-y-1 flex flex-col h-full">
      <button onClick={() => onDelete(entity)} className="absolute top-3 right-3 text-slate-500 hover:text-red-400 transition-colors z-10" aria-label="Delete entity">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
        </svg>
      </button>
      <div className="flex-grow">
        <div className="flex items-center justify-between mb-3 pr-6">
          <h3 className="text-lg font-semibold text-slate-100 truncate pr-2">{entity.name}</h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
            {entity.type}
          </span>
        </div>
        {isBusiness && <p className="text-sm text-slate-400 mb-4">EIN: {entity.ein}</p>}
        <div className="border-t border-slate-700 pt-3 space-y-2">
          {entity.bankConnected ? (
            <div className="flex items-center text-xs font-medium text-emerald-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>
              Bank Account Connected
            </div>
          ) : (
            <div className="flex items-center text-xs font-medium text-amber-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 011-1h.01a1 1 0 010 2H10a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
              Bank Connection Required
            </div>
          )}
          {isBusiness && (
            entity.isVerified ? (
              <div className="flex items-center text-xs font-medium text-emerald-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944a11.954 11.954 0 007.834 3.055a1.96 1.96 0 01.522 3.569l-7.177 7.177a1 1 0 01-1.414 0l-3.535-3.536a1 1 0 011.414-1.414l2.828 2.829l6.465-6.465a.96.96 0 00-1.086-1.086A9.954 9.954 0 0110 3.944a9.954 9.954 0 01-6.334-2.475a1.96 1.96 0 01.5-2.469z" clipRule="evenodd" /></svg>
                EIN Verified
              </div>
            ) : (
              <div className="flex items-center text-xs font-medium text-amber-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 011-1h.01a1 1 0 010 2H10a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                EIN Verification Required
              </div>
            )
          )}
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-700">
        <button onClick={() => onViewDetail(entity)} className="w-full text-center px-4 py-2 bg-blue-600/80 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors text-sm">
          {isBusiness ? 'Manage Entity' : 'Manage Account'}
        </button>
      </div>
    </div>
  );
};