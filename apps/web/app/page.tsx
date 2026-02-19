export default function DashboardPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p style={{ color: 'var(--muted)' }}>
        Create your profile, add sources, and trigger a scan to get started.
      </p>
      <ul style={{ marginTop: '1.5rem' }}>
        <li>
          <a href="/profile">Profile</a> — Set your resume-derived profile and preferences.
        </li>
        <li>
          <a href="/sources">Sources</a> — Add or enable job sources (company pages, boards).
        </li>
        <li>
          <a href="/runs">Runs</a> — Start a scan and view run history.
        </li>
      </ul>
    </div>
  );
}
