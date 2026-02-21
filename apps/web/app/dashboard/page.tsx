import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@careersignal/db';
import { getProfileByUserId, getPreferencesByUserId } from '@careersignal/db';
import { listSources, listRuns } from '@careersignal/db';
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
  const [profile, preferences, sources, runs] = await Promise.all([
    getProfileByUserId(db, user.id),
    getPreferencesByUserId(db, user.id),
    listSources(db, user.id),
    listRuns(db, user.id),
  ]);

  const hasProfile = !!profile?.name && !!profile?.resumeRawText;
  const hasPreferences = !!preferences;
  const totalSources = sources?.length ?? 0;
  const enabledSources = sources?.filter((s) => s.enabled).length ?? 0;
  const lastRun = runs?.[0];
  const completedRuns = runs?.filter((r) => r.status === 'COMPLETED').length ?? 0;

  const cards = [
    {
      title: 'Profile',
      description: hasProfile ? 'Resume and basics set' : 'Add your resume and basics',
      href: '/profile',
      stat: hasProfile ? 'Complete' : 'Setup',
      done: hasProfile,
    },
    {
      title: 'Preferences',
      description: hasPreferences
        ? 'Job search preferences saved'
        : 'Set locations, seniority, filters',
      href: '/preferences',
      stat: hasPreferences ? 'Saved' : 'Setup',
      done: hasPreferences,
    },
    {
      title: 'Sources',
      description:
        totalSources > 0
          ? `${enabledSources} out of ${totalSources} enabled`
          : 'Add or enable job sources',
      href: '/sources',
      stat: totalSources > 0 ? `${enabledSources}/${totalSources} enabled` : 'Setup',
      done: enabledSources > 0,
    },
    {
      title: 'Results',
      description: lastRun
        ? `Last scan: ${lastRun.status.toLowerCase()} — ${new Date(lastRun.createdAt).toLocaleDateString()}`
        : 'Start a scan to fetch and rank jobs',
      href: '/runs',
      stat: completedRuns > 0 ? `${completedRuns} completed` : 'No scans yet',
      done: completedRuns > 0,
    },
  ];

  const completedCount = cards.filter((c) => c.done).length;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <h1>Dashboard</h1>
        <p>Overview of your account and next steps.</p>
      </div>

      <ParsingStatusBadge />

      <div
        style={{
          marginBottom: '1.25rem',
          padding: '0.75rem 1rem',
          background: 'var(--surface-elevated)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Account progress
        </span>
        <span
          style={{
            fontWeight: 600,
            color: completedCount === 4 ? 'var(--accent)' : 'var(--text)',
            fontSize: '0.9375rem',
          }}
        >
          {completedCount} of 4 complete
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1.25rem',
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
              padding: '1.25rem 1.5rem',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '0.75rem',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '1.0625rem', color: 'var(--text)' }}>
                {c.title}
              </span>
              <span
                className="badge"
                style={{
                  background: c.done ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                  color: c.done ? 'var(--accent)' : 'var(--muted)',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                }}
              >
                {c.stat}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              {c.description}
            </p>
            <div
              style={{
                marginTop: '0.875rem',
                height: 4,
                borderRadius: 2,
                background: 'var(--border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: c.done ? '100%' : '0%',
                  background: 'var(--accent)',
                  borderRadius: 2,
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
