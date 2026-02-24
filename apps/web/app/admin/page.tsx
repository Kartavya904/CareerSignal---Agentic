'use client';

import { useEffect, useState, useRef } from 'react';
import { useAdminLogs } from '../components/AdminLogsContext';

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

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function formatDateTime(ts: number) {
  return new Date(ts).toISOString();
}

type AgentLogEntry = import('../components/AdminLogsContext').AgentLogEntry;
type BrainLogEntry = import('../components/AdminLogsContext').BrainLogEntry;

function buildLogsSummary(brainLogs: BrainLogEntry[], agentLogs: AgentLogEntry[]): string {
  const lines: string[] = [];
  lines.push('CareerSignal Admin — Logs export');
  lines.push(`Generated: ${formatDateTime(Date.now())}`);
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('BRAIN ORCHESTRATOR LOGS');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  if (brainLogs.length === 0) {
    lines.push('(no brain logs)');
  } else {
    for (const l of brainLogs) {
      lines.push(`[${formatDateTime(l.ts)}] [${l.level}] ${l.message}`);
      if (l.reasoning) lines.push(`  Diagnosis: ${l.reasoning}`);
      if (l.recommendation) lines.push(`  Recommendation: ${l.recommendation}`);
      if (l.suggestedUrl) lines.push(`  Suggested URL: ${l.suggestedUrl}`);
      if (l.cycleDelaySeconds != null) lines.push(`  Next cycle in ${l.cycleDelaySeconds}s`);
      lines.push('');
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('AGENT TERMINAL LOGS');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  if (agentLogs.length === 0) {
    lines.push('(no agent logs)');
  } else {
    for (const l of agentLogs) {
      lines.push(`[${formatDateTime(l.ts)}] [${l.agent}] ${l.message}`);
      if (l.detail) lines.push(`  ${l.detail}`);
    }
  }

  return lines.join('\n');
}

function downloadLogs(brainLogs: BrainLogEntry[], agentLogs: AgentLogEntry[]) {
  const content = buildLogsSummary(brainLogs, agentLogs);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `careersignal-admin-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
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
  const {
    agentLogs: logs,
    brainLogs,
    lastAgentLogId,
    lastBrainLogId,
    appendAgentLogs,
    appendBrainLogs,
    clearLogs,
  } = useAdminLogs();

  const [sources, setSources] = useState<BlessedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [scrapingRunning, setScrapingRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [waitingForCaptchaSolve, setWaitingForCaptchaSolve] = useState(false);
  const [waitingForLogin, setWaitingForLogin] = useState(false);
  const [visibleMode, setVisibleMode] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const brainTerminalRef = useRef<HTMLDivElement>(null);

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
        const newLogs = (data.logs ||
          []) as import('../components/AdminLogsContext').AgentLogEntry[];
        if (newLogs.length > 0) appendAgentLogs(newLogs);
      })
      .catch(() => {});
  };

  const loadBrainLogs = (afterId?: string) => {
    const url = afterId ? `/api/admin/brain-logs?after=${afterId}` : '/api/admin/brain-logs';
    fetch(url)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((data) => {
        const newLogs = (data.logs ||
          []) as import('../components/AdminLogsContext').BrainLogEntry[];
        if (newLogs.length > 0) appendBrainLogs(newLogs);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    loadLogs(lastAgentLogId ?? undefined);
    loadBrainLogs(lastBrainLogId ?? undefined);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => loadLogs(lastAgentLogId ?? undefined), 800);
    return () => clearInterval(interval);
  }, [lastAgentLogId, appendAgentLogs]);

  useEffect(() => {
    const interval = setInterval(() => loadBrainLogs(lastBrainLogId ?? undefined), 1000);
    return () => clearInterval(interval);
  }, [lastBrainLogId, appendBrainLogs]);

  useEffect(() => {
    const loadStatus = () => {
      fetch('/api/admin/scrape/status')
        .then((r) => (r.ok ? r.json() : {}))
        .then(
          (data: {
            running?: boolean;
            waitingForCaptchaSolve?: boolean;
            waitingForLogin?: boolean;
          }) => {
            setScrapingRunning(data?.running === true);
            setWaitingForCaptchaSolve(data?.waitingForCaptchaSolve === true);
            setWaitingForLogin(data?.waitingForLogin === true);
          },
        )
        .catch(() => {});
    };
    loadStatus();
    const interval = setInterval(loadStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
  }, [logs]);

  useEffect(() => {
    brainTerminalRef.current?.scrollTo(0, brainTerminalRef.current.scrollHeight);
  }, [brainLogs]);

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
    fetch('/api/admin/scrape/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: visibleMode }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setScrapingRunning(true);
          loadSources();
        }
      })
      .catch(() => {});
  };

  const handleCaptchaSolved = () => {
    fetch('/api/admin/scrape/captcha-solved', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setWaitingForCaptchaSolve(false);
      })
      .catch(() => {});
  };

  const handleLoggedIn = () => {
    fetch('/api/admin/scrape/login-solved', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setWaitingForLogin(false);
      })
      .catch(() => {});
  };

  const handleStopScrape = () => {
    setStopping(true);
    fetch('/api/admin/scrape/stop', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setScrapingRunning(false);
          clearLogs();
        }
      })
      .catch(() => {})
      .finally(() => setStopping(false));
  };

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleString();
  };

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <button
            type="button"
            onClick={() => downloadLogs(brainLogs, logs)}
            style={{
              fontSize: '0.875rem',
              padding: '0.4rem 0.75rem',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Download logs
          </button>
        </div>
        <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
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
        {/* Terminals column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Brain Terminal */}
          <div
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 140,
            }}
          >
            <h2
              className="section-title"
              style={{
                margin: '0 0 0.75rem 0',
                color: '#a78bfa',
                textTransform: 'none',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>Brain</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 400,
                  color: 'var(--muted)',
                }}
              >
                Orchestrator — plans, decides, logs
              </span>
            </h2>
            <div
              ref={brainTerminalRef}
              style={{
                flex: 1,
                minHeight: 100,
                maxHeight: 180,
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
              {brainLogs.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>
                  Brain orchestrates each step: plans → decides → logs. Run scrape to start.
                </div>
              ) : (
                brainLogs.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      marginBottom: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      padding: '0.25rem 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#8b949e', flexShrink: 0 }}>[{formatTime(l.ts)}]</span>
                      <span
                        style={{
                          color:
                            l.level === 'ok'
                              ? '#22c55e'
                              : l.level === 'warn'
                                ? '#eab308'
                                : l.level === 'error'
                                  ? '#ef4444'
                                  : l.level === 'insight'
                                    ? '#a78bfa'
                                    : '#c9d1d9',
                        }}
                      >
                        {l.message}
                      </span>
                    </div>
                    {(l.recommendation ||
                      l.reasoning ||
                      l.suggestedUrl ||
                      l.cycleDelaySeconds != null) && (
                      <div
                        style={{
                          marginLeft: '1rem',
                          fontSize: '0.7rem',
                          color: '#8b949e',
                          lineHeight: 1.4,
                        }}
                      >
                        {l.reasoning && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <strong>Diagnosis:</strong> {l.reasoning}
                          </div>
                        )}
                        {l.recommendation && !l.reasoning && (
                          <div style={{ marginTop: '0.25rem' }}>{l.recommendation}</div>
                        )}
                        {l.recommendation && l.reasoning && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <strong>Recommendation:</strong> {l.recommendation}
                          </div>
                        )}
                        {l.suggestedUrl && (
                          <div style={{ marginTop: '0.25rem' }}>
                            Try URL:{' '}
                            <code style={{ fontSize: '0.65rem', wordBreak: 'break-all' }}>
                              {l.suggestedUrl}
                            </code>
                          </div>
                        )}
                        {l.cycleDelaySeconds != null && (
                          <span style={{ marginTop: '0.25rem', display: 'block' }}>
                            Next cycle in {l.cycleDelaySeconds}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Agent Terminal */}
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
              <div
                style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
              >
                {(logs.length > 0 || brainLogs.length > 0) && (
                  <button
                    type="button"
                    onClick={clearLogs}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.35rem 0.6rem',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear logs
                  </button>
                )}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.75rem',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleMode}
                    onChange={(e) => setVisibleMode(e.target.checked)}
                    disabled={scrapingRunning}
                    style={{ cursor: scrapingRunning ? 'not-allowed' : 'pointer' }}
                  />
                  Run visible (bypass bot checks)
                </label>
                {waitingForCaptchaSolve && (
                  <button
                    type="button"
                    onClick={handleCaptchaSolved}
                    style={{
                      fontSize: '0.8125rem',
                      padding: '0.4rem 0.75rem',
                      background: '#22c55e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Captcha solved — Continue
                  </button>
                )}
                {waitingForLogin && (
                  <button
                    type="button"
                    onClick={handleLoggedIn}
                    style={{
                      fontSize: '0.8125rem',
                      padding: '0.4rem 0.75rem',
                      background: '#a78bfa',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Logged in — Continue
                  </button>
                )}
                <button
                  type="button"
                  disabled={scrapingRunning}
                  onClick={handleRunScrape}
                  className="btn btn-primary"
                  style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
                >
                  Run scrape
                </button>
                <button
                  type="button"
                  disabled={!scrapingRunning || stopping}
                  onClick={handleStopScrape}
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.4rem 0.75rem',
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: scrapingRunning ? '#ef4444' : 'var(--muted)',
                    cursor: scrapingRunning && !stopping ? 'pointer' : 'not-allowed',
                  }}
                >
                  {stopping ? 'Stopping…' : 'Stop scrape'}
                </button>
              </div>
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
