'use client';

import { useEffect, useState, useRef } from 'react';

type BlessedSource = {
  id: string;
  name: string;
  url: string;
  type: string;
  slug: string | null;
  enabledForScraping: boolean;
  scrapeIntervalMinutes: number | null;
  lastScrapedAt: string | null;
  lastScrapeStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type LogEntry = {
  id: string;
  ts: number;
  agent: string;
  level: string;
  message: string;
  detail?: string;
};

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function levelColor(level: string) {
  switch (level) {
    case 'success':
      return '#22c55e';
    case 'warn':
      return '#eab308';
    case 'error':
      return '#ef4444';
    default:
      return 'var(--muted)';
  }
}

export default function AdminPage() {
  const [sources, setSources] = useState<BlessedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scraping, setScraping] = useState(false);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const loadSources = () => {
    setLoading(true);
    fetch('/api/admin/blessed-sources')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  };

  const loadLogs = (afterId?: string) => {
    const url = afterId ? `/api/admin/logs?after=${afterId}` : '/api/admin/logs';
    fetch(url)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((data) => {
        const newLogs = (data.logs || []) as LogEntry[];
        if (newLogs.length > 0) {
          setLogs((prev) => {
            const ids = new Set(prev.map((l) => l.id));
            const added = newLogs.filter((l) => !ids.has(l.id));
            return [...prev, ...added];
          });
          setLastLogId(newLogs[newLogs.length - 1]?.id ?? null);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadLogs(lastLogId ?? undefined), 800);
    return () => clearInterval(interval);
  }, [lastLogId]);

  useEffect(() => {
    terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
  }, [logs]);

  const handleToggle = (id: string, enabled: boolean) => {
    setToggling(id);
    fetch(`/api/admin/blessed-sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_for_scraping: enabled }),
    })
      .then((r) => {
        if (r.ok) loadSources();
      })
      .finally(() => setToggling(null));
  };

  const handleRunScrape = () => {
    setScraping(true);
    fetch('/api/admin/scrape/start', { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        loadSources();
      })
      .catch(() => {})
      .finally(() => setScraping(false));
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleString();
  };

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <h1>Admin</h1>
        <p>
          Control scraping sources and watch agent activity in real time. Enable only the sources
          you want to test.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {/* Terminal */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 320,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
            }}
          >
            <h2
              className="section-title"
              style={{
                margin: 0,
                color: 'var(--accent)',
                textTransform: 'none',
                fontSize: '1rem',
              }}
            >
              Agent Terminal
            </h2>
            <button
              type="button"
              disabled={scraping}
              onClick={handleRunScrape}
              className="btn btn-primary"
              style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
            >
              {scraping ? 'Running…' : 'Run scrape'}
            </button>
          </div>
          <div
            ref={terminalRef}
            style={{
              flex: 1,
              minHeight: 240,
              maxHeight: 360,
              overflow: 'auto',
              background: '#0d1117',
              borderRadius: 8,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              fontSize: '0.75rem',
              lineHeight: 1.5,
              padding: '0.75rem',
              border: '1px solid var(--border)',
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>
                No logs yet. Click &quot;Run scrape&quot; to start.
              </div>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  style={{
                    marginBottom: '0.25rem',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ color: '#8b949e', flexShrink: 0 }}>[{formatTime(l.ts)}]</span>
                  <span
                    style={{
                      color: '#58a6ff',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    [{l.agent}]
                  </span>
                  <span style={{ color: levelColor(l.level) }}>{l.message}</span>
                  {l.detail && (
                    <div
                      style={{
                        width: '100%',
                        marginLeft: '1.5rem',
                        fontSize: '0.7rem',
                        color: '#8b949e',
                        overflow: 'auto',
                      }}
                    >
                      {l.detail}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Blessed sources */}
        <div className="card">
          <h2
            className="section-title"
            style={{
              margin: '0 0 1rem 0',
              color: 'var(--accent)',
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            Default sources
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Toggle sources on to include them in scrape runs. Use one at a time while testing.
          </p>
          {loading ? (
            <p style={{ color: 'var(--muted)' }}>Loading…</p>
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
              {[...sources]
                .sort((a, b) =>
                  a.enabledForScraping === b.enabledForScraping ? 0 : a.enabledForScraping ? -1 : 1,
                )
                .map((s) => (
                  <li
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.5rem',
                      background: 'var(--surface-elevated)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <strong style={{ flex: 1, fontSize: '0.875rem' }}>{s.name}</strong>
                    <span
                      className="badge"
                      style={{
                        background: s.enabledForScraping
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'var(--surface)',
                        color: s.enabledForScraping ? '#22c55e' : 'var(--muted)',
                        fontSize: '0.7rem',
                      }}
                    >
                      {s.enabledForScraping ? 'On' : 'Off'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={s.enabledForScraping}
                      disabled={toggling === s.id}
                      onClick={() => handleToggle(s.id, !s.enabledForScraping)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: s.enabledForScraping ? 'var(--accent)' : 'var(--surface)',
                        cursor: toggling === s.id ? 'not-allowed' : 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: s.enabledForScraping ? 20 : 2,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.15s ease',
                        }}
                      />
                    </button>
                  </li>
                ))}
              {sources.length === 0 && (
                <li style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
                  No blessed sources. Seed the database.
                </li>
              )}
            </ul>
          )}
          {!loading && sources.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                fontSize: '0.75rem',
                color: 'var(--muted)',
              }}
            >
              Last scraped per source shown above. Run scrape to populate job cache.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
