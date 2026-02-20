'use client';

import { useEffect, useState, useRef } from 'react';

const WORK_AUTH_OPTIONS = ['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER'] as const;

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  location: string;
  work_authorization: string;
}

interface ResumeStatus {
  hasResume: boolean;
  filename: string | null;
}

function isProfileComplete(form: ProfileForm, resume: ResumeStatus): boolean {
  return !!(
    form.name.trim() &&
    form.location.trim() &&
    form.work_authorization &&
    resume.hasResume
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    email: '',
    phone: '',
    location: '',
    work_authorization: 'H1B',
  });

  const [resume, setResume] = useState<ResumeStatus>({ hasResume: false, filename: null });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then((r) => r.json()),
      fetch('/api/profile/resume').then((r) => r.json()),
    ])
      .then(([profileData, resumeData]) => {
        if (profileData?.name) {
          setForm({
            name: profileData.name,
            email: profileData.email ?? '',
            phone: profileData.phone ?? '',
            location: profileData.location ?? '',
            work_authorization: profileData.workAuthorization ?? 'H1B',
          });
        }
        if (resumeData) {
          setResume({
            hasResume: resumeData.hasResume ?? false,
            filename: resumeData.filename ?? null,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await fetch('/api/profile/resume', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
      } else {
        setResume({ hasResume: true, filename: data.filename });
      }
    } catch {
      setUploadError('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteResume = async () => {
    try {
      await fetch('/api/profile/resume', { method: 'DELETE' });
      setResume({ hasResume: false, filename: null });
    } catch {
      // ignore
    }
  };

  if (loading) return <p>Loading profile…</p>;

  const complete = isProfileComplete(form, resume);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Profile</h1>

      {/* Completion Status */}
      <div
        style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          borderRadius: 8,
          background: complete ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
          border: `1px solid ${complete ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
        }}
      >
        <strong style={{ color: complete ? '#22c55e' : '#eab308' }}>
          {complete ? 'Profile Complete' : 'Profile Incomplete'}
        </strong>
        <p style={{ margin: '0.5rem 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
          {complete
            ? "You're all set! Your profile and resume are ready."
            : 'Please fill in your name, location, work authorization, and upload your resume.'}
        </p>
      </div>

      <div
        style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr', maxWidth: '56rem' }}
      >
        {/* Profile Form */}
        <div>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Basic Info</h2>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <label>
              Name *
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              Phone
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              Location *
              <input
                type="text"
                required
                placeholder="e.g., San Francisco, CA"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              Work Authorization *
              <select
                value={form.work_authorization}
                onChange={(e) => setForm((f) => ({ ...f, work_authorization: e.target.value }))}
                style={inputStyle}
              >
                {WORK_AUTH_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
              {saved && <span style={{ color: '#22c55e', fontSize: '0.9rem' }}>Saved!</span>}
            </div>
          </form>
        </div>

        {/* Resume Upload */}
        <div>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Resume</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Upload your resume (PDF, DOCX, DOC, or TXT). Max 10MB.
          </p>

          {resume.hasResume ? (
            <div
              style={{
                padding: '1rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <strong style={{ color: '#22c55e' }}>Resume uploaded</strong>
                  <p
                    style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}
                  >
                    {resume.filename}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteResume}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: '0.85rem',
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileChange}
                disabled={uploading}
                style={{ display: 'none' }}
                id="resume-upload"
              />
              <label
                htmlFor="resume-upload"
                style={{
                  display: 'inline-block',
                  padding: '0.75rem 1.5rem',
                  background: 'var(--surface)',
                  border: '2px dashed var(--border)',
                  borderRadius: 8,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {uploading ? 'Uploading…' : 'Click to upload resume'}
              </label>
              {uploadError && (
                <p style={{ color: '#ef4444', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  {uploadError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '0.25rem',
  padding: '0.5rem',
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
};
