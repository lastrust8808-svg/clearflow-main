import type { CSSProperties } from 'react';
import type { DirectDepositAuthorizationRecord, EmployeeRecord } from '../../types/core';
import PageSection from '../ui/PageSection';
import WorkbenchRecordCard from '../ui/WorkbenchRecordCard';

interface PayrollWorkspaceProps {
  employees: EmployeeRecord[];
  directDepositAuthorizations: DirectDepositAuthorizationRecord[];
  onAddEmployee: () => void;
  onRequestDirectDeposit: () => void;
}

const actionButtonStyle: CSSProperties = {
  padding: '10px 14px',
  minHeight: 40,
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.4)',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontWeight: 600,
};

export default function PayrollWorkspace({
  employees,
  directDepositAuthorizations,
  onAddEmployee,
  onRequestDirectDeposit,
}: PayrollWorkspaceProps) {
  return (
    <PageSection
      title="Payroll & Employee Banking"
      description="Run payroll-ready employee records, retain direct-deposit authorizations, and keep signed bank instructions linked to the worker profile."
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onAddEmployee} style={actionButtonStyle}>+ Add Employee</button>
          <button type="button" onClick={onRequestDirectDeposit} style={actionButtonStyle}>+ Direct Deposit Form</button>
        </div>

        {employees.length === 0 ? (
          <div style={{ color: '#d1d5db' }}>No payroll employees have been created yet.</div>
        ) : (
          employees.map((employee) => {
            const authorization = directDepositAuthorizations.find(
              (record) => record.employeeId === employee.id
            );

            return (
              <WorkbenchRecordCard
                key={employee.id}
                title={employee.fullName}
                subtitle={`${employee.employeeType} | ${employee.paySchedule} | ${employee.status}`}
                summaryItems={[
                  { label: 'Department', value: employee.department || 'Not set' },
                  { label: 'Title', value: employee.title || 'Not set' },
                  {
                    label: 'Compensation',
                    value:
                      employee.compensationType === 'salary'
                        ? employee.annualSalary
                          ? `$${employee.annualSalary.toLocaleString()} salary`
                          : 'Salary profile'
                        : employee.compensationType === 'hourly'
                          ? employee.hourlyRate
                            ? `$${employee.hourlyRate.toLocaleString()} / hr`
                            : 'Hourly profile'
                          : 'Contract profile',
                  },
                  { label: 'Bank Form', value: authorization?.status || 'not_requested' },
                  { label: 'Request Email', value: authorization?.requestEmail || employee.email },
                  { label: 'Files', value: employee.linkedDocumentIds?.length || 0 },
                ]}
                actionSlot={
                  <button type="button" onClick={onRequestDirectDeposit} style={actionButtonStyle}>
                    Direct Deposit
                  </button>
                }
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>
                    <strong style={{ color: '#e5e7eb' }}>Start date:</strong> {employee.startDate || 'Not set'}
                  </div>
                  <div>
                    <strong style={{ color: '#e5e7eb' }}>Contact:</strong> {employee.email}
                    {employee.phone ? ` | ${employee.phone}` : ''}
                  </div>
                  <div>
                    <strong style={{ color: '#e5e7eb' }}>Direct deposit status:</strong>{' '}
                    {authorization
                      ? `${authorization.status}${authorization.returnedAt ? ` | returned ${authorization.returnedAt.slice(0, 10)}` : ''}`
                      : 'Request not sent yet'}
                  </div>
                </div>
              </WorkbenchRecordCard>
            );
          })
        )}
      </div>
    </PageSection>
  );
}
