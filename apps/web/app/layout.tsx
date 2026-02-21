import type { Metadata } from 'next';
import './globals.css';
import { getSessionUser } from '@/lib/auth';
import { HeaderAuth } from './components/HeaderAuth';
import { ToastProvider } from './components/ToastContext';
import { UserActivityProvider } from './components/UserActivityProvider';

export const metadata: Metadata = {
  title: 'CareerSignal',
  description: 'Semi-autonomous career intelligence platform',
};

const navLinkClass =
  'text-[var(--text-secondary)] hover:text-[var(--accent)] text-sm font-medium transition-colors';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <UserActivityProvider>
          <ToastProvider>
            <header
              className="border-b border-[var(--border)] z-50"
              style={{
                position: 'sticky',
                top: 0,
                backgroundColor: '#222529',
                padding: '0.75rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem',
              }}
            >
              <nav style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
                <a
                  href="/"
                  className="font-bold text-lg tracking-tight hover:opacity-90 transition-opacity"
                  style={{ color: 'var(--text)' }}
                >
                  <span style={{ color: 'var(--accent)' }}>Career</span>Signal
                </a>
                {user && (
                  <>
                    <a href="/dashboard" className={navLinkClass}>
                      Dashboard
                    </a>
                    <a href="/profile" className={navLinkClass}>
                      Profile
                    </a>
                    <a href="/preferences" className={navLinkClass}>
                      Preferences
                    </a>
                    <a href="/sources" className={navLinkClass}>
                      Sources
                    </a>
                    <a href="/runs" className={navLinkClass}>
                      Runs
                    </a>
                  </>
                )}
              </nav>
              <HeaderAuth user={user} />
            </header>
            <main className="container" style={{ padding: '1.75rem 1.5rem' }}>
              {children}
            </main>
          </ToastProvider>
        </UserActivityProvider>
      </body>
    </html>
  );
}
