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
        background: 'var(--cf-panel)',
        border: '1px solid var(--cf-border)',
        borderRadius: 20,
        padding: 18,
        boxShadow: 'var(--cf-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: 19,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0) 22%)',
        }}
      />
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20, position: 'relative', zIndex: 1 }}>{title}</h2>
        {description ? (
          <p style={{ margin: '6px 0 0 0', color: 'var(--cf-muted)', position: 'relative', zIndex: 1 }}>
            {description}
          </p>
        ) : null}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </section>
  );
}
