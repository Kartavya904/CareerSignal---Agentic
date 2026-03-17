'use client';

import Link from 'next/link';
import { useState } from 'react';

export type JobRecommendation = {
  title: string;
  company: string;
  location: string | null;
  href: string;
  score: number | null;
  grade: string | null;
};

export function JobRecommendationsCarousel({ jobs }: { jobs: JobRecommendation[] }) {
  const [index, setIndex] = useState(0);

  if (!jobs.length) return null;

  const total = jobs.length;
  const currentIndex = Math.min(Math.max(index, 0), total - 1);
  const current = jobs[currentIndex]!;

  const goPrev = () => {
    setIndex((prev) => (prev === 0 ? jobs.length - 1 : prev - 1));
  };

  const goNext = () => {
    setIndex((prev) => (prev === jobs.length - 1 ? 0 : prev + 1));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous job"
        style={{
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--surface-elevated)',
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--muted-foreground)',
        }}
      >
        ‹
      </button>
      <Link
        href={current.href}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '0.75rem',
          padding: '1rem 1.1rem',
          background: 'var(--surface-elevated)',
          borderRadius: 8,
          border: '1px solid var(--border)',
          textDecoration: 'none',
          color: 'inherit',
          fontSize: '0.9rem',
        }}
      >
        <div
          style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--text)',
                fontSize: '0.98rem',
                marginBottom: '0.1rem',
              }}
            >
              {current.title}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.3rem',
                fontSize: '0.85rem',
                color: 'var(--muted-foreground)',
              }}
            >
              <span>{current.company}</span>
              {current.location && (
                <span
                  style={{
                    paddingInline: '0.45rem',
                    paddingBlock: '0.1rem',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  {current.location}
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--muted-foreground)',
              lineHeight: 1.5,
            }}
          >
            {current.score != null ? (
              <>
                Match score:{' '}
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  {Number(current.score).toFixed(1)}
                  {current.grade ? ` (${current.grade})` : ''}
                </span>
                . Click to see the full breakdown, tailored materials, and details for this role.
              </>
            ) : (
              <>Click to see the full job description and generate a tailored application packet.</>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '0.25rem',
            gap: '0.5rem',
          }}
        >
          {current.score != null && (
            <span
              className="badge"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                fontSize: '0.8rem',
                padding: '0.2rem 0.55rem',
              }}
            >
              Analyzed role
            </span>
          )}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.8rem',
              color: 'var(--muted-foreground)',
            }}
          >
            {currentIndex + 1} of {total}
          </span>
        </div>
      </Link>
      <button
        type="button"
        onClick={goNext}
        aria-label="Next job"
        style={{
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--surface-elevated)',
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--muted-foreground)',
        }}
      >
        ›
      </button>
    </div>
  );
}
