import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';

export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 0.5rem' }}>
      {/* Hero */}
      <section style={{ marginBottom: '2rem', paddingTop: '0.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'nowrap',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 4.5vw, 2.25rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              margin: 0,
              color: 'var(--text)',
              flex: 1,
              minWidth: 0,
            }}
          >
            Your career, <span style={{ color: 'var(--accent)' }}>tuned to signal</span>
          </h1>
          {user && (
            <Link
              href="/dashboard"
              className="btn btn-primary"
              style={{ fontSize: '0.9rem', paddingInline: '0.9rem', whiteSpace: 'nowrap' }}
            >
              Dashboard
            </Link>
          )}
        </div>
        <p
          style={{
            fontSize: '1.125rem',
            color: 'var(--muted-foreground)',
            margin: '0.75rem 0 1.25rem 0',
            lineHeight: 1.65,
          }}
        >
          CareerSignal is a semi-autonomous career intelligence platform. You bring job URLs; the
          Application Assistant extracts, matches to your profile, and helps with cover letters and
          prep—without paid APIs or cloud lock-in.
        </p>
        {!user && (
          <Link href="/signin" className="btn btn-primary" style={{ fontSize: '0.9375rem' }}>
            Sign in to get started
          </Link>
        )}
      </section>

      {/* Three things + Built for real use */}
      <section
        style={{
          marginBottom: '1.75rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <h2
            className="section-title"
            style={{
              marginTop: 0,
              marginBottom: '0.75rem',
              color: 'var(--accent)',
              textTransform: 'none',
              letterSpacing: '0',
              fontSize: '1rem',
            }}
          >
            Three things
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: 0,
              color: 'var(--muted-foreground)',
              lineHeight: 1.7,
              fontSize: '0.9375rem',
            }}
          >
            <li>
              <strong style={{ color: 'var(--text)' }}>Profile</strong> — Upload your resume; AI
              turns it into structured data.
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Preferences</strong> — Tell it what roles,
              locations, and levels you want.
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Application Assistant</strong> — Paste a job
              URL; get a match score and tailored drafts for that role.
            </li>
          </ul>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <h2
            className="section-title"
            style={{
              marginTop: 0,
              marginBottom: '0.75rem',
              color: 'var(--accent)',
              textTransform: 'none',
              letterSpacing: '0',
              fontSize: '1rem',
            }}
          >
            Built for real use
          </h2>
          <p
            style={{
              margin: '0 0 0.5rem 0',
              color: 'var(--muted-foreground)',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: 'var(--text)' }}>$0 budget.</strong> Local Ollama models only,
            backed by PostgreSQL and Next.js. Agentic workflows, code-first logic, and no cloud
            lock-in.
          </p>
          <p
            style={{
              margin: 0,
              color: 'var(--muted-foreground)',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
            }}
          >
            Fast 8B models handle extraction; larger 32B models do the deeper reasoning. One job at
            a time.
          </p>
        </div>
      </section>

      {/* Made by */}
      <section
        className="card card-elevated"
        style={{
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted-foreground)',
            fontSize: '1.5rem',
            flexShrink: 0,
          }}
          aria-hidden
        >
          {/* Placeholder: upload your photo later; Next.js Image can replace this */}
          KS
        </div>
        <div>
          <p style={{ margin: 0, color: 'var(--text)', fontWeight: 600, fontSize: '1rem' }}>
            Made by Kartavya Singh
          </p>
          <p
            style={{
              margin: '0.25rem 0 0 0',
              color: 'var(--muted-foreground)',
              fontSize: '0.875rem',
            }}
          >
            CareerSignal is a personal project—agentic career intelligence, built and run locally.
          </p>
        </div>
      </section>
    </div>
  );
}
