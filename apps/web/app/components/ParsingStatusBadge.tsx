'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface ParseStatus {
  exists: boolean;
  active: boolean;
  done: boolean;
  step: { step: number; total: number; name: string } | null;
  entryCount: number;
}

export function ParsingStatusBadge() {
  const [status, setStatus] = useState<ParseStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/profile/parse-resume/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ParseStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* ignore */
      }
    };

    check();
    intervalRef.current = setInterval(check, 2000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!status?.exists || !status.active) return null;

  const progress = status.step ? Math.round((status.step.step / status.step.total) * 100) : 0;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Link
      href="/profile"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'rgba(234, 179, 8, 0.08)',
        border: '1px solid rgba(234, 179, 8, 0.25)',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s ease',
        marginBottom: '1rem',
      }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="rgba(234, 179, 8, 0.15)"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="#eab308"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text
          x="22"
          y="23"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#eab308"
          fontSize="11"
          fontWeight="600"
          fontFamily="monospace"
        >
          {progress}%
        </text>
      </svg>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
          Parsing resume...
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: 2 }}>
          {status.step
            ? `Step ${status.step.step}/${status.step.total}: ${status.step.name}`
            : 'Starting...'}
        </div>
      </div>
    </Link>
  );
}
