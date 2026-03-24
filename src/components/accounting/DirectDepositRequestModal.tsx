import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { EmployeeRecord } from '../../types/core';
import type { DirectDepositRequestSubmitPayload } from './accountingTypes';

interface DirectDepositRequestModalProps {
  open: boolean;
  employees: EmployeeRecord[];
  onClose: () => void;
  onSubmit: (payload: DirectDepositRequestSubmitPayload) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2,6,23,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '92vh',
  overflowY: 'auto',
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.2)',
  background: '#0f172a',
  color: '#e5e7eb',
  padding: 20,
  display: 'grid',
  gap: 16,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.5)',
  color: '#e5e7eb',
  boxSizing: 'border-box',
};

const buttonStyle: CSSProperties = {
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function DirectDepositRequestModal({
  open,
  employees,
  onClose,
  onSubmit,
}: DirectDepositRequestModalProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [sendByEmail, setSendByEmail] = useState(true);
  const [notes, setNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] =
    useState<DirectDepositRequestSubmitPayload['accountType']>('checking');

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId),
    [employeeId, employees]
  );

  useEffect(() => {
    if (!open) return;
    setEmployeeId(employees[0]?.id || '');
    setRequestEmail(employees[0]?.email || '');
    setSendByEmail(true);
    setNotes('');
    setUploadedFile(null);
    setSignatureName('');
    setRoutingNumber('');
    setAccountNumber('');
    setAccountType('checking');
  }, [employees, open]);

  useEffect(() => {
    if (selectedEmployee?.email) {
      setRequestEmail(selectedEmployee.email);
    }
  }, [selectedEmployee]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Direct Deposit Authorization</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Email the authorization packet or retain the signed return file against the employee profile.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={inputStyle}>
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
          <input value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} placeholder="Request email" style={inputStyle} />
          <label style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={sendByEmail} onChange={(e) => setSendByEmail(e.target.checked)} />
            Send authorization request by email
          </label>
          <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Returned signature name" style={inputStyle} />
          <input value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} placeholder="Routing number (optional)" style={inputStyle} />
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number (optional)" style={inputStyle} />
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as DirectDepositRequestSubmitPayload['accountType'])} style={inputStyle}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="other">Other</option>
          </select>
          <input type="file" onChange={(e) => setUploadedFile(e.target.files?.[0] || null)} style={inputStyle} />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Request wording, onboarding notes, or return review notes"
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Cancel</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                employeeId,
                requestEmail,
                sendByEmail,
                notes,
                uploadedFile,
                uploadedFileName: uploadedFile?.name,
                signatureName,
                routingNumber,
                accountNumber,
                accountType,
              })
            }
            style={{ ...buttonStyle, background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))', borderColor: 'rgba(126,242,255,0.28)' }}
          >
            Save Authorization
          </button>
        </div>
      </div>
    </div>
  );
}
