interface StatCardProps {
  label: string;
  value: string | number;
  subvalue?: string;
}

export default function StatCard({ label, value, subvalue }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--cf-panel-strong)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 16,
        boxShadow: 'var(--cf-shadow)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--cf-accent-soft)', marginBottom: 8, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
      {subvalue ? (
        <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 8 }}>{subvalue}</div>
      ) : null}
    </div>
  );
}
