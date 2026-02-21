'use client';

import { useEffect, useState } from 'react';
import { useReportAction } from '../components/UserActivityProvider';

type Source = {
  id: string;
  name: string;
  url: string;
  type: string;
  enabled: boolean;
  isBlessed: boolean;
  status: string;
};

export default function SourcesPage() {
  const reportAction = useReportAction();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const load = () => {
    fetch('/api/sources')
      .then((r) => r.json())
      .then(setSources)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setAdding(true);
    fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), url: url.trim() }),
    })
      .then((r) => r.json())
      .then(() => {
        reportAction('add_source', { name: name.trim(), url: url.trim() });
        setName('');
        setUrl('');
        load();
        setAdding(false);
      })
      .catch(() => setAdding(false));
  };

  if (loading) {
    return (
      <div className="page-head">
        <h1>Sources</h1>
        <p style={{ color: 'var(--muted)' }}>Loading sources…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <h1>Sources</h1>
        <p>
          Job boards and company career pages. Default sources are pre-seeded when you first run the
          app.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '2rem', maxWidth: '28rem' }}>
        <h2
          className="section-title"
          style={{
            color: 'var(--accent)',
            textTransform: 'none',
            letterSpacing: '0',
            marginTop: 0,
          }}
        >
          Add source
        </h2>
        <form
          onSubmit={handleAdd}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. LinkedIn Jobs"
            />
          </div>
          <div>
            <label className="label">URL</label>
            <input
              type="url"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
          >
            {adding ? 'Adding…' : 'Add source'}
          </button>
        </form>
      </div>

      <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>
        Your sources
      </h2>
      {sources.length === 0 ? (
        <div
          className="card"
          style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}
        >
          No sources yet. Add one above or run the app once to seed default boards.
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
          {sources.map((s) => (
            <li
              key={s.id}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
              >
                <strong style={{ color: 'var(--text)', fontSize: '1rem' }}>{s.name}</strong>
                {s.isBlessed && (
                  <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                    default
                  </span>
                )}
                <span
                  className="badge"
                  style={{
                    marginLeft: 'auto',
                    background:
                      s.status === 'ACTIVE' ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                    color: s.status === 'ACTIVE' ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {s.status}
                </span>
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--accent)', wordBreak: 'break-all' }}
              >
                {s.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
