'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useReportAction } from './UserActivityProvider';

type User = { id: string; email: string | null; name: string | null };

export function HeaderAuth({ user }: { user: User | null }) {
  const router = useRouter();
  const reportAction = useReportAction();

  const handleSignOut = async () => {
    reportAction('sign_out');
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/signin');
    router.refresh();
  };

  if (!user) {
    return (
      <Link href="/signin" style={{ fontSize: '0.9rem' }}>
        Sign in
      </Link>
    );
  }

  const label = user.name?.trim() || user.email || 'Account';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{label}</span>
      <button
        type="button"
        onClick={handleSignOut}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          fontSize: '0.9rem',
          padding: 0,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Sign out
      </button>
    </span>
  );
}
