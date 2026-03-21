import RecordEditorCard from '../ui/RecordEditorCard';
import PageSection from '../ui/PageSection';

interface EditableRecordSectionProps<T extends { id: string }> {
  title: string;
  description: string;
  emptyMessage: string;
  records: T[];
  getTitle: (record: T) => string;
  getSubtitle: (record: T) => string;
  onSave: (nextRecord: T) => void;
}

export default function EditableRecordSection<T extends { id: string }>({
  title,
  description,
  emptyMessage,
  records,
  getTitle,
  getSubtitle,
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
              <RecordEditorCard
                title={getTitle(record)}
                subtitle={getSubtitle(record)}
                record={record}
                onSave={onSave}
              />
            </div>
          ))
        )}
      </div>
    </PageSection>
  );
}
