import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';

export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Hero */}
      <section style={{ marginBottom: '3rem', paddingTop: '0.5rem' }}>
        <h1
          style={{
            fontSize: 'clamp(2rem, 5vw, 2.75rem)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            margin: '0 0 1rem 0',
            color: 'var(--text)',
          }}
        >
          Your career, <span style={{ color: 'var(--accent)' }}>signal over noise</span>
        </h1>
        <p
          style={{
            fontSize: '1.125rem',
            color: 'var(--muted)',
            margin: '0 0 1.5rem 0',
            lineHeight: 1.65,
          }}
        >
          CareerSignal is a semi-autonomous career intelligence platform. It scans job sources,
          ranks roles by fit, and helps you focus on opportunities that actually match your
          profile—without paid APIs or cloud lock-in.
        </p>
        {user ? (
          <Link href="/dashboard" className="btn btn-primary" style={{ fontSize: '0.9375rem' }}>
            Go to Dashboard →
          </Link>
        ) : (
          <Link href="/signin" className="btn btn-primary" style={{ fontSize: '0.9375rem' }}>
            Sign in to get started
          </Link>
        )}
      </section>

      {/* What it does */}
      <section className="card" style={{ marginBottom: '2rem' }}>
        <h2
          className="section-title"
          style={{
            marginTop: 0,
            marginBottom: '1rem',
            color: 'var(--accent)',
            textTransform: 'none',
            letterSpacing: '0',
          }}
        >
          What it does
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.25rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.8,
          }}
        >
          <li>
            <strong style={{ color: 'var(--text)' }}>Profile</strong> — Upload your resume; AI
            parses experience, skills, and preferences.
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Preferences</strong> — Set work auth,
            locations, seniority, and strictness. One-click autofill from profile.
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Sources</strong> — Add job boards and company
            career pages. Default sources are pre-seeded.
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Scan & rank</strong> — Each run extracts jobs,
            scores them with rules + LLM, and surfaces the top matches.
          </li>
          <li>
            <strong style={{ color: 'var(--text)' }}>Roadmap</strong> — Contact discovery, outreach
            drafting, and application tracking (V1/V2).
          </li>
        </ul>
      </section>

      {/* Credibility / stack */}
      <section className="card" style={{ marginBottom: '2rem' }}>
        <h2
          className="section-title"
          style={{
            marginTop: 0,
            marginBottom: '1rem',
            color: 'var(--accent)',
            textTransform: 'none',
            letterSpacing: '0',
          }}
        >
          Built for real use
        </h2>
        <p
          style={{
            margin: '0 0 1rem 0',
            color: 'var(--text-secondary)',
            fontSize: '0.9375rem',
            lineHeight: 1.65,
          }}
        >
          <strong style={{ color: 'var(--text)' }}>$0 budget.</strong> No paid APIs, no hosted
          LLMs—Ollama-only, local models. PostgreSQL + Next.js + agentic workflows. Hybrid agents:
          code-first logic with LLM only where it adds value (parsing, ranking nuance, outreach).
          Single-user, local deployment. Ship fast, iterate.
        </p>
        <p
          style={{
            margin: 0,
            color: 'var(--text-secondary)',
            fontSize: '0.9375rem',
            lineHeight: 1.65,
          }}
        >
          Two-tier model strategy: fast 8B models for bulk tasks (normalization, extraction), 32B
          for reasoning (match scoring, planning, drafting). Rule scorer is deterministic; LLM
          ranker adds nuance. Top-15 per source, strict/semi-strict/off filter so you control how
          picky the pipeline is.
        </p>
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
            color: 'var(--muted)',
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
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>
            CareerSignal is a personal project—agentic career intelligence, built and run locally.
          </p>
        </div>
      </section>
    </div>
  );
}
