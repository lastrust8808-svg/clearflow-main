import type { ReactNode } from 'react';

interface PageSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function PageSection({
  title,
  description,
  children,
}: PageSectionProps) {
  return (
    <section
      style={{
        position: 'relative',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0)) , var(--cf-panel)',
        border: '1px solid var(--cf-border)',
        borderRadius: 22,
        padding: 20,
        boxShadow: 'var(--cf-shadow)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '0 auto auto 0',
          width: 140,
          height: 3,
          background: 'linear-gradient(90deg, var(--cf-accent), var(--cf-accent-soft))',
          opacity: 0.9,
        }}
      />
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20, position: 'relative', zIndex: 1, lineHeight: 1.2 }}>{title}</h2>
        {description ? (
          <p style={{ margin: '8px 0 0 0', color: 'var(--cf-muted)', position: 'relative', zIndex: 1, lineHeight: 1.6 }}>
            {description}
          </p>
        ) : null}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </section>
  );
}
