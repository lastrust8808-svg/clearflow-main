interface StatCardProps {
  label: string;
  value: string | number;
  subvalue?: string;
}

export default function StatCard({ label, value, subvalue }: StatCardProps) {
  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0)) , var(--cf-panel-strong)',
        border: '1px solid var(--cf-border)',
        borderRadius: 20,
        padding: 18,
        boxShadow: 'var(--cf-shadow)',
        minHeight: 132,
        display: 'grid',
        alignContent: 'start',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--cf-accent-soft)', marginBottom: 6, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
      {subvalue ? (
        <div style={{ fontSize: 12, color: 'var(--cf-muted)', marginTop: 8, lineHeight: 1.55 }}>{subvalue}</div>
      ) : null}
    </div>
  );
}
