'use client';

import { useEffect, useState } from 'react';

const WORK_AUTH_OPTIONS = ['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER'] as const;

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    work_authorization: 'H1B' as string,
  });

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data?.name) {
          setForm({
            name: data.name,
            email: data.email ?? '',
            phone: data.phone ?? '',
            location: data.location ?? '',
            work_authorization: data.workAuthorization ?? 'H1B',
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then((r) => r.json())
      .then(() => setSaving(false))
      .catch(() => setSaving(false));
  };

  if (loading) return <p>Loading profile…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Profile</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Your resume-derived profile. Required: name, location, work authorization.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          maxWidth: '28rem',
        }}
      >
        <label>
          Name *
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
          Phone
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
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
          Location *
          <input
            type="text"
            required
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
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
          Work authorization *
          <select
            value={form.work_authorization}
            onChange={(e) => setForm((f) => ({ ...f, work_authorization: e.target.value }))}
            style={{
              display: 'block',
              marginTop: '0.25rem',
              padding: '0.5rem',
              width: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }}
          >
            {WORK_AUTH_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem 1rem',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
