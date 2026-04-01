import { Logo } from '../logo/Logo';

interface PublicLegalPageProps {
  title: string;
  description: string;
  documents: Array<{
    title: string;
    content: string;
  }>;
}

export default function PublicLegalPage({
  title,
  description,
  documents,
}: PublicLegalPageProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(54, 215, 255, 0.16), transparent 25%), linear-gradient(180deg, #0c1224 0%, #111827 100%)',
        color: '#f8fbff',
        padding: '32px 20px 56px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          display: 'grid',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <Logo height={56} />
          <a
            href="/"
            style={{
              color: '#c7f1ff',
              textDecoration: 'none',
              border: '1px solid rgba(126, 242, 255, 0.2)',
              borderRadius: 999,
              padding: '10px 14px',
              fontWeight: 700,
            }}
          >
            Back to ClearFlow
          </a>
        </div>

        <div
          style={{
            borderRadius: 26,
            padding: 28,
            background: 'rgba(15, 23, 42, 0.78)',
            border: '1px solid rgba(126, 242, 255, 0.14)',
            boxShadow: '0 24px 70px rgba(2, 6, 23, 0.35)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1 }}>{title}</h1>
          <p style={{ marginTop: 12, marginBottom: 0, color: '#b7cad8', lineHeight: 1.7 }}>
            {description}
          </p>
        </div>

        {documents.map((document) => (
          <section
            key={document.title}
            style={{
              borderRadius: 22,
              padding: 24,
              background: 'rgba(15, 23, 42, 0.72)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 24 }}>{document.title}</h2>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                lineHeight: 1.75,
                color: '#dbe8f2',
                fontSize: 15,
              }}
            >
              {document.content}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
