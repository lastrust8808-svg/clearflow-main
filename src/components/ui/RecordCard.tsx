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
          'linear-gradient(180deg, rgba(24, 37, 67, 0.88) 0%, rgba(19, 18, 42, 0.9) 100%)',
        border: '1px solid var(--cf-border)',
        borderRadius: 18,
        padding: 16,
        boxShadow: 'var(--cf-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      {subtitle ? (
        <div style={{ color: 'var(--cf-muted)', marginTop: 6 }}>{subtitle}</div>
      ) : null}
      {children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}

