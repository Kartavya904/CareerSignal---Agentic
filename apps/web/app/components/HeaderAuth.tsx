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
      <Link
        href="/signin"
        className="btn btn-primary"
        style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
      >
        Sign in
      </Link>
    );
  }

  const label = user.name?.trim() || user.email || 'Account';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{label}</span>
      <button
        type="button"
        onClick={handleSignOut}
        className="btn btn-ghost"
        style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
      >
        Sign out
      </button>
    </span>
  );
}
