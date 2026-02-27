import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@careersignal/db';
import { getProfileByUserId, getPreferencesByUserId } from '@careersignal/db';
import { listAnalysesByUser } from '@careersignal/db';
import { ParsingStatusBadge } from '../components/ParsingStatusBadge';
import { ApplicationAssistantStatusBadge } from '../components/ApplicationAssistantStatusBadge';

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
  const [profile, preferences, analyses] = await Promise.all([
    getProfileByUserId(db, user.id),
    getPreferencesByUserId(db, user.id),
    listAnalysesByUser(db, user.id),
  ]);

  const hasProfile = !!profile?.name && !!profile?.resumeRawText;
  const hasPreferences = !!preferences;
  const analysesCount = analyses?.length ?? 0;

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
      title: 'Application Assistant',
      description:
        analysesCount > 0
          ? `Analyze job pages and get match, cover letters, and prep`
          : 'Paste a job URL — get analysis, match, and cover letter drafts',
      href: '/application-assistant',
      stat: analysesCount > 0 ? `${analysesCount} analysis` : 'Ready',
      done: analysesCount > 0,
    },
  ];

  const accountComplete = [hasProfile, hasPreferences].filter(Boolean).length;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <h1>Dashboard</h1>
        <p>Overview of your account and next steps.</p>
      </div>

      <ParsingStatusBadge />
      <ApplicationAssistantStatusBadge />

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
        <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
          Account progress
        </span>
        <span
          style={{
            fontWeight: 600,
            color: accountComplete === 2 ? 'var(--accent)' : 'var(--text)',
            fontSize: '0.9375rem',
          }}
        >
          {accountComplete} of 2 complete
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
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
                  color: c.done ? 'var(--accent)' : 'var(--muted-foreground)',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                }}
              >
                {c.stat}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.9375rem',
                color: 'var(--muted-foreground)',
                lineHeight: 1.5,
              }}
            >
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
