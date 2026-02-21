import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@careersignal/db';
import { getProfileByUserId, getPreferencesByUserId } from '@careersignal/db';
import { getEnabledSourceIds } from '@careersignal/db';
import { listRuns } from '@careersignal/db';
import { ParsingStatusBadge } from '../components/ParsingStatusBadge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>Sign in to see your dashboard.</p>
        <Link href="/signin" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Sign in
        </Link>
      </div>
    );
  }

  const db = getDb();
  const [profile, preferences, sourceIds, runs] = await Promise.all([
    getProfileByUserId(db, user.id),
    getPreferencesByUserId(db, user.id),
    getEnabledSourceIds(db, user.id),
    listRuns(db, user.id),
  ]);

  const hasProfile = !!profile?.name && !!profile?.resumeRawText;
  const hasPreferences = !!preferences;
  const sourceCount = sourceIds?.length ?? 0;
  const runCount = runs?.length ?? 0;
  const lastRun = runs?.[0];
  const completedRuns = runs?.filter((r) => r.status === 'COMPLETED').length ?? 0;

  const cards = [
    {
      title: 'Profile',
      description: hasProfile ? 'Resume and basics set' : 'Add your resume and basics',
      href: '/profile',
      stat: hasProfile ? 'Complete' : 'Setup',
      accent: hasProfile,
    },
    {
      title: 'Preferences',
      description: hasPreferences
        ? 'Job search preferences saved'
        : 'Set locations, seniority, filters',
      href: '/preferences',
      stat: hasPreferences ? 'Saved' : 'Setup',
      accent: hasPreferences,
    },
    {
      title: 'Sources',
      description: `${sourceCount} source${sourceCount !== 1 ? 's' : ''} enabled`,
      href: '/sources',
      stat: String(sourceCount),
      accent: sourceCount > 0,
    },
    {
      title: 'Runs',
      description: lastRun
        ? `Last: ${lastRun.status.toLowerCase()} — ${new Date(lastRun.createdAt).toLocaleDateString()}`
        : 'No scans yet',
      href: '/runs',
      stat: `${completedRuns} completed`,
      accent: completedRuns > 0,
    },
  ];

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '2rem' }}>
        <h1>Dashboard</h1>
        <p>Overview of your account and next steps.</p>
      </div>

      <ParsingStatusBadge />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card"
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
              transition: 'border-color 0.15s ease, transform 0.1s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '0.5rem',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.title}</span>
              <span
                className="badge"
                style={{
                  background: c.accent ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                  color: c.accent ? 'var(--accent)' : 'var(--muted)',
                  fontSize: '0.7rem',
                }}
              >
                {c.stat}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              {c.description}
            </p>
          </Link>
        ))}
      </div>

      <section className="card">
        <h2 className="section-title">Quick start</h2>
        <ol
          style={{
            margin: 0,
            paddingLeft: '1.25rem',
            color: 'var(--text-secondary)',
            lineHeight: 2,
          }}
        >
          <li>
            <Link href="/profile" style={{ fontWeight: 500 }}>
              Profile
            </Link>{' '}
            — Upload your resume and fill basics.
          </li>
          <li>
            <Link href="/preferences" style={{ fontWeight: 500 }}>
              Preferences
            </Link>{' '}
            — Set work auth, locations, and filters (or autofill from profile).
          </li>
          <li>
            <Link href="/sources" style={{ fontWeight: 500 }}>
              Sources
            </Link>{' '}
            — Add or enable job sources.
          </li>
          <li>
            <Link href="/runs" style={{ fontWeight: 500 }}>
              Runs
            </Link>{' '}
            — Start a scan and view results.
          </li>
        </ol>
      </section>
    </div>
  );
}
