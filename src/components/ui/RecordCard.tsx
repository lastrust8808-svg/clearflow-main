import type { ReactNode } from 'react';

interface RecordCardProps {
  key?: string | number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export default function RecordCard({
  title,
  subtitle,
  children,
}: RecordCardProps) {
  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0)) , var(--cf-panel-strong)',
        border: '1px solid var(--cf-border)',
        borderRadius: 20,
        padding: 18,
        boxShadow: 'var(--cf-shadow)',
        minHeight: 100,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{title}</div>
      {subtitle ? (
        <div style={{ color: 'var(--cf-muted)', marginTop: 8, lineHeight: 1.55 }}>{subtitle}</div>
      ) : null}
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

