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

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return 'badge-success';
  if (s === 'RUNNING' || s === 'PENDING') return 'badge-warning';
  if (s === 'FAILED' || s === 'CANCELLED') return 'badge-error';
  return 'badge-muted';
}

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

  if (loading) {
    return (
      <div className="page-head">
        <h1>Results</h1>
        <p style={{ color: 'var(--muted)' }}>Loading results…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <h1>Results</h1>
        <p>Each scan runs across your enabled sources. Agents extract, rank, and surface jobs.</p>
      </div>

      <div
        className="card"
        style={{
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2
            className="section-title"
            style={{
              color: 'var(--accent)',
              textTransform: 'none',
              letterSpacing: '0',
              marginTop: 0,
              marginBottom: '0.25rem',
            }}
          >
            New scan
          </h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.875rem' }}>
            Start a scan to fetch and rank jobs from your enabled sources.
          </p>
        </div>
        <button
          onClick={startScan}
          disabled={starting}
          className="btn btn-primary"
          style={{ flexShrink: 0 }}
        >
          {starting ? 'Starting…' : 'Start scan'}
        </button>
      </div>

      <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>
        Scan history
      </h2>
      {runs.length === 0 ? (
        <div
          className="card"
          style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}
        >
          No results yet. Click &quot;Start scan&quot; to create one.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {runs.map((r) => (
            <li
              key={r.id}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {r.id.slice(0, 8)}…
                </span>
                <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                {(r.status === 'RUNNING' || r.status === 'PAUSED') && r.planSnapshot?.steps && (
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    —{' '}
                    {r.planSnapshot.steps.find((s) => s.status === 'running')?.name ??
                      r.planSnapshot.steps.filter((s) => s.status === 'completed').slice(-1)[0]
                        ?.name ??
                      'Starting…'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
                Created {new Date(r.createdAt).toLocaleString()}
                {r.startedAt && ` · Started ${new Date(r.startedAt).toLocaleString()}`}
                {r.finishedAt && ` · Finished ${new Date(r.finishedAt).toLocaleString()}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
