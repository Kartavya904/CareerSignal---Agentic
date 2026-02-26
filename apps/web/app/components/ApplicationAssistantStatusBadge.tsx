'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface AssistantStatus {
  running: boolean;
  currentStep: string;
  sessionId: string | null;
  analysisId: string | null;
  waitingForLogin?: boolean;
  waitingForCaptcha?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  idle: 'Idle',
  scraping: 'Loading page…',
  extracting: 'Extracting job details…',
  matching: 'Matching profile…',
  writing: 'Writing cover letter & prep…',
  done: 'Done',
  error: 'Error',
};

export function ApplicationAssistantStatusBadge() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/api/application-assistant/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as AssistantStatus;
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

  if (!status?.running) return null;

  const stepLabel = STEP_LABELS[status.currentStep] ?? status.currentStep;

  return (
    <Link
      href="/application-assistant"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s ease',
        marginBottom: '1rem',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#3b82f6',
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
          Application Assistant — analysis in progress
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
          {status.waitingForLogin
            ? 'Waiting for you to log in in the browser…'
            : status.waitingForCaptcha
              ? 'Waiting for captcha to be solved…'
              : stepLabel}
        </div>
      </div>
    </Link>
  );
}
