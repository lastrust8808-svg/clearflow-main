import type { ReactNode } from 'react';
import PageSection from '../ui/PageSection';
import WorkbenchRecordCard, { type WorkbenchSummaryItem } from '../ui/WorkbenchRecordCard';

interface EditableRecordSectionProps<T extends { id: string }> {
  title: string;
  description: string;
  emptyMessage: string;
  records: T[];
  getTitle: (record: T) => string;
  getSubtitle: (record: T) => string;
  getSummaryItems?: (record: T) => WorkbenchSummaryItem[];
  renderDetails?: (record: T) => ReactNode;
  onSave: (nextRecord: T) => void;
}

function buildDefaultSummaryItems<T extends { id: string }>(record: T): WorkbenchSummaryItem[] {
  return Object.entries(record)
    .filter(([key, value]) => {
      if (
        key === 'id' ||
        key === 'notes' ||
        key.startsWith('linked') ||
        value === undefined ||
        value === null
      ) {
        return false;
      }

      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      );
    })
    .slice(0, 6)
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
      value: String(value),
    }));
}

export default function EditableRecordSection<T extends { id: string }>({
  title,
  description,
  emptyMessage,
  records,
  getTitle,
  getSubtitle,
  getSummaryItems,
  renderDetails,
  onSave,
}: EditableRecordSectionProps<T>) {
  return (
    <PageSection title={title} description={description}>
      <div style={{ display: 'grid', gap: 16 }}>
        {records.length === 0 ? (
          <div style={{ color: '#d1d5db' }}>{emptyMessage}</div>
        ) : (
          records.map((record) => (
            <div key={record.id}>
              <WorkbenchRecordCard
                title={getTitle(record)}
                subtitle={getSubtitle(record)}
                summaryItems={getSummaryItems ? getSummaryItems(record) : buildDefaultSummaryItems(record)}
                record={record}
                onSave={onSave}
              >
                {renderDetails ? renderDetails(record) : null}
              </WorkbenchRecordCard>
            </div>
          ))
        )}
      </div>
    </PageSection>
  );
}
