'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import { useReportAction } from './UserActivityProvider';

type User = { id: string; email: string | null; name: string | null; admin?: boolean | null };

const navLinkClass =
  'text-[var(--text-secondary)] hover:text-[var(--accent)] text-sm font-medium transition-colors';

export function HeaderAuth({ user }: { user: User | null }) {
  const router = useRouter();
  const reportAction = useReportAction();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

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
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
      <Link
        href="/dashboard"
        className="btn btn-primary"
        style={{
          fontSize: '0.875rem',
          padding: '0.5rem 1rem',
          whiteSpace: 'nowrap',
          textDecoration: 'none',
        }}
      >
        Dashboard
      </Link>
      <Link
        href="/application-assistant"
        className="btn btn-primary"
        style={{
          fontSize: '0.875rem',
          padding: '0.5rem 1rem',
          whiteSpace: 'nowrap',
          textDecoration: 'none',
        }}
      >
        Application Assistant
      </Link>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'stretch',
          minHeight: 0,
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div
          style={{
            height: '100%',
            minHeight: '2.5rem',
            width: 'fit-content',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            style={{
              color: open ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '0 1rem',
              height: '80%',
              minHeight: '2rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: open ? 'rgba(255,255,255,0.06)' : 'none',
              border: 'none',
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
          >
            {label}
          </button>
        </div>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 0,
              minWidth: '11rem',
              padding: '0.375rem 0',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)',
              zIndex: 100000,
            }}
          >
            <Link
              href="/profile"
              className={navLinkClass}
              style={{
                display: 'block',
                padding: '0.625rem 1.25rem',
                textDecoration: 'none',
                color: 'var(--text)',
                fontSize: '0.875rem',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'var(--text)';
              }}
            >
              Profile
            </Link>
            <Link
              href="/preferences"
              className={navLinkClass}
              style={{
                display: 'block',
                padding: '0.625rem 1.25rem',
                textDecoration: 'none',
                color: 'var(--text)',
                fontSize: '0.875rem',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'var(--text)';
              }}
            >
              Preferences
            </Link>
            {user.admin && (
              <Link
                href="/admin"
                className={navLinkClass}
                style={{
                  display: 'block',
                  padding: '0.625rem 1.25rem',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  fontSize: '0.875rem',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = 'var(--text)';
                }}
              >
                Admin
              </Link>
            )}
            <div
              style={{
                height: 1,
                margin: '0.25rem 0.75rem',
                background: 'var(--border)',
              }}
            />
            <button
              type="button"
              onClick={handleSignOut}
              className={navLinkClass}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.625rem 1.25rem',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
                color: 'var(--text)',
                fontSize: '0.875rem',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'var(--text)';
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
