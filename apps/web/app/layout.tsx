import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareerSignal',
  description: 'Semi-autonomous career intelligence platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
          }}
        >
          <a href="/" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
            CareerSignal
          </a>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <a href="/">Dashboard</a>
            <a href="/profile">Profile</a>
            <a href="/sources">Sources</a>
            <a href="/runs">Runs</a>
          </nav>
        </header>
        <main style={{ padding: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
