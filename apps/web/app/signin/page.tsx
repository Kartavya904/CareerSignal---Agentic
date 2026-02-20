'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Sign in failed');
        setLoading(false);
        return;
      }
      router.push(from);
      router.refresh();
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Sign in to your CareerSignal account.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div>
          <label
            htmlFor="email"
            style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--muted)' }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            htmlFor="password"
            style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--muted)' }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>
        {error && <p style={{ color: 'var(--accent)', margin: 0, fontSize: '0.9rem' }}>{error}</p>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ color: 'var(--muted)', marginTop: '1.5rem', fontSize: '0.9rem' }}>
        Don&apos;t have an account? <Link href="/signup">Create one</Link>
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--surface)',
  color: 'var(--text)',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  marginTop: '0.5rem',
};
