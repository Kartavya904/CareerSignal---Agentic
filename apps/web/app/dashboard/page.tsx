import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import {
  getDb,
  getProfileByUserId,
  getPreferencesByUserId,
  listAnalysesByUser,
  listJobListingsWithCompany,
  normalizeJobDedupeKey,
} from '@careersignal/db';
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
  const [profile, preferences, analyses, jobListings] = await Promise.all([
    getProfileByUserId(db, user.id),
    getPreferencesByUserId(db, user.id),
    listAnalysesByUser(db, user.id),
    listJobListingsWithCompany(db, { status: 'OPEN', limit: 30 }),
  ]);

  // Map normalized analysis URL -> { id, matchScore, matchGrade, company } so we can show score and company when a listing was analyzed
  const analysisByUrl = new Map<
    string,
    { id: string; matchScore: number | null; matchGrade: string | null; company: string | null }
  >();
  for (const a of analyses ?? []) {
    const key = normalizeJobDedupeKey(a.url);
    if (!analysisByUrl.has(key)) {
      const js = (a.jobSummary as { company?: string } | null) ?? {};
      const snap = (a.companySnapshot as { name?: string } | null) ?? {};
      analysisByUrl.set(key, {
        id: a.id,
        matchScore: a.matchScore != null ? Number(a.matchScore) : null,
        matchGrade: a.matchGrade ?? null,
        company: js.company ?? snap.name ?? null,
      });
    }
  }

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

  const card0 = cards[0]!;
  const card1 = cards[1]!;
  const card2 = cards[2]!;

  const accountComplete = [hasProfile, hasPreferences].filter(Boolean).length;

  return (
    <div>
      <div
        className="page-head"
        style={{ marginBottom: '1.5rem', paddingBottom: 0, borderBottom: 'none' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1>Dashboard</h1>
            <p>Overview of your account and next steps.</p>
          </div>
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--surface-elevated)',
              borderRadius: 999,
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
          >
            <span style={{ color: 'var(--muted-foreground)' }}>Account progress</span>
            <span
              style={{
                fontWeight: 600,
                color: accountComplete === 2 ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {accountComplete} of 2 complete
            </span>
          </div>
        </div>
      </div>

      <ParsingStatusBadge />
      <ApplicationAssistantStatusBadge />

      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          padding: '1.25rem 1.5rem',
        }}
      >
        <h2
          style={{
            margin: 0,
            marginBottom: '0.75rem',
            fontSize: '1.05rem',
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          Job positions you might like
        </h2>
        {(() => {
          const jobsToShow =
            jobListings && jobListings.length > 0
              ? jobListings.map((job) => {
                  const keyApply = job.applyUrl ? normalizeJobDedupeKey(job.applyUrl) : null;
                  const keyJob = job.jobUrl ? normalizeJobDedupeKey(job.jobUrl) : null;
                  const analysis =
                    (keyApply && analysisByUrl.get(keyApply)) ??
                    (keyJob && analysisByUrl.get(keyJob)) ??
                    null;
                  return {
                    title: job.title,
                    company: analysis?.company ?? job.companyName ?? 'Company',
                    location: job.location,
                    href: analysis
                      ? `/application-assistant/${analysis.id}`
                      : (job.jobUrl ?? job.applyUrl ?? '/application-assistant'),
                    score: analysis?.matchScore ?? null,
                    grade: analysis?.matchGrade ?? null,
                  };
                })
              : (analyses ?? []).map((a) => {
                  const js = (a.jobSummary as { title?: string; company?: string } | null) ?? {};
                  const snap = (a.companySnapshot as { name?: string } | null) ?? {};
                  return {
                    title: js.title ?? 'Job',
                    company: js.company ?? snap.name ?? 'Company',
                    location: null as string | null,
                    href: `/application-assistant/${a.id}`,
                    score: a.matchScore != null ? Number(a.matchScore) : null,
                    grade: a.matchGrade ?? null,
                  };
                });
          if (jobsToShow.length === 0) {
            return (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  color: 'var(--muted-foreground)',
                }}
              >
                No job positions yet. Use Application Assistant to analyze a job URL — analyzed
                roles will appear here with your match score.
              </p>
            );
          }
          return (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {jobsToShow.map((job, i) => (
                <Link
                  key={i}
                  href={job.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.6rem 0.75rem',
                    background: 'var(--surface-elevated)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'inherit',
                    fontSize: '0.9rem',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{job.title}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>
                      {' · '}
                      {job.company}
                    </span>
                    {job.location && (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                        {' · '}
                        {job.location}
                      </span>
                    )}
                  </div>
                  {job.score != null && (
                    <span
                      className="badge"
                      style={{
                        flexShrink: 0,
                        background: 'var(--accent-muted)',
                        color: 'var(--accent)',
                        fontSize: '0.8rem',
                        padding: '0.2rem 0.5rem',
                      }}
                    >
                      {Number(job.score).toFixed(1)}
                      {job.grade ? ` · ${job.grade}` : ''}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          );
        })()}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: '1.25rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          <Link
            href={card0.href}
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
                {card0.title}
              </span>
              <span
                className="badge"
                style={{
                  background: card0.done ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                  color: card0.done ? 'var(--accent)' : 'var(--muted-foreground)',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                }}
              >
                {card0.stat}
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
              {card0.description}
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
                  width: card0.done ? '100%' : '0%',
                  background: 'var(--accent)',
                  borderRadius: 2,
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </Link>

          <Link
            href={card1.href}
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
                {card1.title}
              </span>
              <span
                className="badge"
                style={{
                  background: card1.done ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                  color: card1.done ? 'var(--accent)' : 'var(--muted-foreground)',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                }}
              >
                {card1.stat}
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
              {card1.description}
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
                  width: card1.done ? '100%' : '0%',
                  background: 'var(--accent)',
                  borderRadius: 2,
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </Link>
        </div>

        <Link
          href={card2.href}
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
              {card2.title}
            </span>
            <span
              className="badge"
              style={{
                background: card2.done ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                color: card2.done ? 'var(--accent)' : 'var(--muted-foreground)',
                fontSize: '0.75rem',
                padding: '0.25rem 0.5rem',
              }}
            >
              {card2.stat}
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
            {card2.description}
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
                width: card2.done ? '100%' : '0%',
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </Link>
      </div>
    </div>
  );
}
