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
  blessedSourceId?: string | null;
};

type JobListing = {
  id: string;
  title: string;
  companyName: string;
  sourceUrl: string;
  location?: string | null;
};

function SourceRow({
  source: s,
  onToggle,
  onDelete,
  onClick,
}: {
  source: Source;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onClick?: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleToggle = () => {
    const next = !s.enabled;
    setToggling(true);
    fetch(`/api/sources/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
      .then((r) => {
        if (r.ok) onToggle(next);
      })
      .finally(() => setToggling(false));
  };
  const handleDelete = () => {
    if (deleting) return;
    setDeleting(true);
    fetch(`/api/sources/${s.id}`, { method: 'DELETE' })
      .then((r) => {
        if (r.ok) onDelete();
      })
      .finally(() => setDeleting(false));
  };

  const [deleteHover, setDeleteHover] = useState(false);
  return (
    <li
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Remove source"
        onMouseEnter={() => setDeleteHover(true)}
        onMouseLeave={() => setDeleteHover(false)}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `1px solid ${deleteHover ? 'rgba(239, 68, 68, 0.8)' : 'var(--border)'}`,
          background: deleteHover ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-elevated)',
          color: deleteHover ? '#ef4444' : 'var(--muted)',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: deleting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
          transform: 'translate(50%, -50%)',
        }}
      >
        ×
      </button>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onClick}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: s.blessedSourceId ? 'pointer' : 'default',
            font: 'inherit',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: '1rem',
            textAlign: 'left',
          }}
        >
          {s.name}
        </button>
        {s.isBlessed && (
          <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
            default
          </span>
        )}
        <span
          className="badge"
          style={{
            marginLeft: 'auto',
            background: s.enabled ? 'rgba(234, 179, 8, 0.2)' : 'var(--surface-elevated)',
            color: s.enabled ? '#eab308' : 'var(--muted)',
          }}
        >
          {s.enabled ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '0.875rem',
            color: 'var(--accent)',
            wordBreak: 'break-all',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          {s.url}
        </a>
        <button
          type="button"
          role="switch"
          aria-checked={s.enabled}
          disabled={toggling}
          onClick={handleToggle}
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: s.enabled ? 'var(--accent)' : 'var(--surface-elevated)',
            cursor: toggling ? 'not-allowed' : 'pointer',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: s.enabled ? 20 : 2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
            }}
          />
        </button>
      </div>
    </li>
  );
}

type DefaultSource = {
  id?: string;
  name: string;
  url: string;
  type: string;
  slug?: string;
  job_count?: number;
};

export default function SourcesPage() {
  const reportAction = useReportAction();
  const [sources, setSources] = useState<Source[]>([]);
  const [defaults, setDefaults] = useState<DefaultSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingDefault, setAddingDefault] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSource, setModalSource] = useState<Source | null>(null);
  const [modalJobs, setModalJobs] = useState<JobListing[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const load = () => {
    fetch('/api/sources')
      .then((r) => r.json())
      .then(setSources)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetch('/api/sources/defaults')
      .then((r) => (r.ok ? r.json() : []))
      .then(setDefaults)
      .catch(() => setDefaults([]));
  }, []);

  const handleSourceClick = (source: Source) => {
    if (!source.blessedSourceId) return;
    setModalSource(source);
    setModalOpen(true);
    setModalLoading(true);
    setModalJobs([]);
    fetch(`/api/sources/${source.id}/jobs`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setModalJobs)
      .catch(() => setModalJobs([]))
      .finally(() => setModalLoading(false));
  };

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
          Job boards and company career pages. Add custom sources or choose from the default list;
          only the ones you add are stored.
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
        <div className="card">
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

        <div className="card">
          <h2
            className="section-title"
            style={{
              color: 'var(--accent)',
              textTransform: 'none',
              letterSpacing: '0',
              marginTop: 0,
            }}
          >
            Add default sources
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Add only the ones you want. They are saved to your account when you add them.
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              justifyContent: 'center',
            }}
          >
            {defaults.map((d) => {
              const alreadyAdded = sources.some((s) => s.url === d.url);
              const isAdding = addingDefault === d.url;
              return (
                <button
                  key={d.url}
                  type="button"
                  disabled={alreadyAdded || isAdding}
                  onClick={() => {
                    if (alreadyAdded || isAdding) return;
                    setAddingDefault(d.url);
                    fetch('/api/sources', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: d.name,
                        url: d.url,
                        type: d.type,
                        is_blessed: true,
                        blessed_source_id: d.id,
                      }),
                    })
                      .then((r) => r.json())
                      .then(() => {
                        reportAction('add_source', { name: d.name, url: d.url });
                        load();
                      })
                      .finally(() => setAddingDefault(null));
                  }}
                  style={{
                    padding: '0.35rem 0.5rem',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: alreadyAdded ? 'var(--surface-elevated)' : 'var(--surface)',
                    color: alreadyAdded ? 'var(--muted)' : 'var(--text)',
                    fontSize: '0.8125rem',
                    whiteSpace: 'nowrap',
                    cursor: alreadyAdded || isAdding ? 'default' : 'pointer',
                    opacity: alreadyAdded ? 0.85 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.125rem',
                  }}
                >
                  <span>{alreadyAdded ? 'Added' : isAdding ? 'Adding…' : d.name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>
                    {d.job_count ?? 0} jobs
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <h2 className="section-title" style={{ marginBottom: '0.75rem' }}>
        Your sources
      </h2>
      {sources.length === 0 ? (
        <div
          className="card"
          style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}
        >
          No sources yet. Add a custom source or add from the default list above.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              onToggle={(enabled) => {
                setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
              }}
              onDelete={() => setSources((prev) => prev.filter((x) => x.id !== s.id))}
              onClick={() => handleSourceClick(s)}
            />
          ))}
        </ul>
      )}

      {modalOpen && modalSource && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="jobs-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 560,
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <h2 id="jobs-modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                {modalSource.name} — scraped jobs
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                }}
              >
                ×
              </button>
            </div>
            {modalLoading ? (
              <p style={{ color: 'var(--muted)' }}>Loading…</p>
            ) : modalJobs.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No jobs cached yet. Run the scraper.</p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {modalJobs.map((j) => (
                  <li
                    key={j.id}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--surface-elevated)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <a
                      href={j.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)', fontWeight: 600 }}
                    >
                      {j.title}
                    </a>
                    <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      {j.companyName}
                      {j.location && ` · ${j.location}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
