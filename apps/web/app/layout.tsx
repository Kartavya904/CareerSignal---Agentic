import type { Metadata } from 'next';
import './globals.css';
import { getSessionUser } from '@/lib/auth';
import { HeaderAuth } from './components/HeaderAuth';
<<<<<<< HEAD
import { ToastProvider } from './components/ToastContext';
=======
>>>>>>> cfe4a32f7c4e28ab8122c7c5fdd5a190405a27a9
import { UserActivityProvider } from './components/UserActivityProvider';

export const metadata: Metadata = {
  title: 'CareerSignal',
  description: 'Semi-autonomous career intelligence platform',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body>
        <UserActivityProvider>
<<<<<<< HEAD
          <ToastProvider>
            <header
              style={{
                borderBottom: '1px solid var(--border)',
                padding: '1rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem',
              }}
            >
              <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <a href="/" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
                  CareerSignal
                </a>
                {user && (
                  <>
                    <a href="/">Dashboard</a>
                    <a href="/profile">Profile</a>
                    <a href="/sources">Sources</a>
                    <a href="/runs">Runs</a>
                  </>
                )}
              </nav>
              <HeaderAuth user={user} />
            </header>
            <main style={{ padding: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>
              {children}
            </main>
          </ToastProvider>
=======
          <header
            style={{
              borderBottom: '1px solid var(--border)',
              padding: '1rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
            }}
          >
            <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <a href="/" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
                CareerSignal
              </a>
              {user && (
                <>
                  <a href="/">Dashboard</a>
                  <a href="/profile">Profile</a>
                  <a href="/sources">Sources</a>
                  <a href="/runs">Runs</a>
                </>
              )}
            </nav>
            <HeaderAuth user={user} />
          </header>
          <main style={{ padding: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>{children}</main>
>>>>>>> cfe4a32f7c4e28ab8122c7c5fdd5a190405a27a9
        </UserActivityProvider>
      </body>
    </html>
  );
}
