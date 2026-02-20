'use client';

import { useEffect, useState } from 'react';
import { useReportAction } from '../components/UserActivityProvider';

type PlanStep = { id: string; name: string; status: string };
type PlanSnapshot = { steps?: PlanStep[]; status?: string };

type Run = {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  planSnapshot?: PlanSnapshot | null;
};

const POLL_INTERVAL_MS = 2000;

export default function RunsPage() {
  const reportAction = useReportAction();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = () => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then(setRuns)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const hasActiveRun = runs.some((r) => r.status === 'PENDING' || r.status === 'RUNNING');
  useEffect(() => {
    if (!hasActiveRun) return;
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasActiveRun, runs.length]);

  const startScan = () => {
    reportAction('start_scan');
    setStarting(true);
    fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then(() => {
        load();
        setStarting(false);
      })
      .catch(() => setStarting(false));
  };

  if (loading) return <p>Loading runs…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Runs</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Each run is a scan across your enabled sources. Agents will extract, rank, and surface jobs
        (once implemented).
      </p>

      <button
        onClick={startScan}
        disabled={starting}
        style={{
          padding: '0.75rem 1.25rem',
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          marginBottom: '2rem',
        }}
      >
        {starting ? 'Starting…' : 'Start scan'}
      </button>

      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Run history</h2>
      {runs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No runs yet. Click &quot;Start scan&quot; to create one.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {runs.map((r) => (
            <li
              key={r.id}
              style={{
                padding: '0.75rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                marginBottom: '0.5rem',
              }}
            >
              <strong>{r.id.slice(0, 8)}…</strong>
              <span style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>{r.status}</span>
              {(r.status === 'RUNNING' || r.status === 'PAUSED') && r.planSnapshot?.steps && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                  —{' '}
                  {r.planSnapshot.steps.find((s) => s.status === 'running')?.name ??
                    r.planSnapshot.steps.filter((s) => s.status === 'completed').slice(-1)[0]
                      ?.name ??
                    'Starting…'}
                </span>
              )}
              <br />
              <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                Created {new Date(r.createdAt).toLocaleString()}
                {r.startedAt && ` · Started ${new Date(r.startedAt).toLocaleString()}`}
                {r.finishedAt && ` · Finished ${new Date(r.finishedAt).toLocaleString()}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
