import React from 'react';

interface ConfirmationModalProps {
  title?: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title = 'Are you sure?',
  message,
  onConfirm,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 w-full max-w-md rounded-lg shadow-2xl border border-slate-700 transform transition-all p-6">
        <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
        <p className="text-slate-400 mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <button onClick={onClose} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-semibold">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-5 py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold text-white">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
