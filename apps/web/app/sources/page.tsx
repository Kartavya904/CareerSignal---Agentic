'use client';

import { useEffect, useState } from 'react';

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
        setName('');
        setUrl('');
        load();
        setAdding(false);
      })
      .catch(() => setAdding(false));
  };

  if (loading) return <p>Loading sources…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Sources</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Job boards and company career pages. Default sources are pre-seeded when you first run the
        app.
      </p>

      <form
        onSubmit={handleAdd}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          maxWidth: '28rem',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Add source</h2>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. LinkedIn Jobs"
            style={{
              display: 'block',
              marginTop: '0.25rem',
              padding: '0.5rem',
              width: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }}
          />
        </label>
        <label>
          URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            style={{
              display: 'block',
              marginTop: '0.25rem',
              padding: '0.5rem',
              width: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }}
          />
        </label>
        <button
          type="submit"
          disabled={adding}
          style={{
            padding: '0.6rem 1rem',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            alignSelf: 'flex-start',
          }}
        >
          {adding ? 'Adding…' : 'Add source'}
        </button>
      </form>

      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Your sources</h2>
      {sources.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No sources yet. Add one above or run the app once to seed default boards.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sources.map((s) => (
            <li
              key={s.id}
              style={{
                padding: '0.75rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                marginBottom: '0.5rem',
              }}
            >
              <strong>{s.name}</strong>
              {s.isBlessed && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                  default
                </span>
              )}
              <br />
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem' }}
              >
                {s.url}
              </a>
              <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                ({s.status})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
