import { useEffect, useState, type CSSProperties } from 'react';
import type { EmployeeSubmitPayload } from './accountingTypes';

interface EmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: EmployeeSubmitPayload) => void;
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

export default function EmployeeModal({ open, onClose, onSubmit }: EmployeeModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeType, setEmployeeType] =
    useState<EmployeeSubmitPayload['employeeType']>('employee');
  const [compensationType, setCompensationType] =
    useState<EmployeeSubmitPayload['compensationType']>('salary');
  const [paySchedule, setPaySchedule] =
    useState<EmployeeSubmitPayload['paySchedule']>('biweekly');
  const [annualSalary, setAnnualSalary] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [defaultHoursPerPeriod, setDefaultHoursPerPeriod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setFullName('');
    setEmail('');
    setPhone('');
    setTitle('');
    setDepartment('');
    setEmployeeType('employee');
    setCompensationType('salary');
    setPaySchedule('biweekly');
    setAnnualSalary('');
    setHourlyRate('');
    setDefaultHoursPerPeriod('');
    setStartDate(new Date().toISOString().slice(0, 10));
    setNotes('');
  }, [open]);

  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add Payroll Profile</div>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Create an employee or contractor record that payroll and direct-deposit onboarding can use.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" style={inputStyle} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={inputStyle} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" style={inputStyle} />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          <select value={employeeType} onChange={(e) => setEmployeeType(e.target.value as EmployeeSubmitPayload['employeeType'])} style={inputStyle}>
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
            <option value="officer">Officer</option>
          </select>
          <select value={compensationType} onChange={(e) => setCompensationType(e.target.value as EmployeeSubmitPayload['compensationType'])} style={inputStyle}>
            <option value="salary">Salary</option>
            <option value="hourly">Hourly</option>
            <option value="contract">Contract</option>
          </select>
          <select value={paySchedule} onChange={(e) => setPaySchedule(e.target.value as EmployeeSubmitPayload['paySchedule'])} style={inputStyle}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="semimonthly">Semimonthly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input value={annualSalary} onChange={(e) => setAnnualSalary(e.target.value)} placeholder="Annual salary" type="number" min="0" step="0.01" style={inputStyle} />
          <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="Hourly rate" type="number" min="0" step="0.01" style={inputStyle} />
          <input value={defaultHoursPerPeriod} onChange={(e) => setDefaultHoursPerPeriod(e.target.value)} placeholder="Default hours / period" type="number" min="0" step="0.25" style={inputStyle} />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Payroll notes, withholding reminders, or onboarding details"
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={buttonStyle}>Cancel</button>
          <button
            type="button"
            onClick={() => {
              onSubmit({
                fullName,
                email,
                phone,
                title,
                department,
                employeeType,
                compensationType,
                paySchedule,
                annualSalary,
                hourlyRate,
                defaultHoursPerPeriod,
                startDate,
                notes,
              });
            }}
            style={{ ...buttonStyle, background: 'linear-gradient(135deg, rgba(33,194,198,0.9), rgba(88,141,255,0.82))', borderColor: 'rgba(126,242,255,0.28)' }}
          >
            Save Employee
          </button>
        </div>
      </div>
    </div>
  );
}
