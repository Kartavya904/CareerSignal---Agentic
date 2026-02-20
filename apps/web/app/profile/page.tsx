'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { ParsingTerminal } from '../components/ParsingTerminal';

const WORK_AUTH_OPTIONS = ['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER'] as const;

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  location: string;
  work_authorization: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
}

interface ResumeStatus {
  hasResume: boolean;
  filename: string | null;
}

interface Experience {
  company: string;
  title: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  bullets?: string[];
}

interface Education {
  institution: string;
  degree?: string | null;
  field?: string | null;
  gpa?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  coursework?: string[];
  awards?: string[];
}

interface Project {
  name: string;
  context?: string | null;
  dates?: string | null;
  description?: string | null;
  technologies?: string[];
  bullets?: string[];
  achievements?: string[];
}

interface ParsedData {
  parsed: boolean;
  parsedAt?: string | null;
  data?: {
    basicInfo: {
      name: string;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
      linkedinUrl?: string | null;
      githubUrl?: string | null;
      portfolioUrl?: string | null;
    };
    experience?: Experience[];
    education?: Education[];
    projects?: Project[];
    skills?: string[];
    certifications?: string[];
    languages?: string[];
  } | null;
}

interface BulletScore {
  bullet: string;
  score: number;
  feedback: string;
}

function isProfileComplete(form: ProfileForm, resume: ResumeStatus): boolean {
  return !!(
    form.name.trim() &&
    form.location.trim() &&
    form.work_authorization &&
    resume.hasResume
  );
}

// Edit icon SVG
function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Analysis icon SVG
function AnalyzeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  );
}

// X icon SVG
function XIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  const [form, setForm] = useState<ProfileForm>({
    name: '',
    email: '',
    phone: '',
    location: '',
    work_authorization: 'OTHER',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
  });

  const [resume, setResume] = useState<ResumeStatus>({ hasResume: false, filename: null });
  const [parsedData, setParsedData] = useState<ParsedData>({ parsed: false });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable state for parsed sections
  const [editableExperience, setEditableExperience] = useState<Experience[]>([]);
  const [editableProjects, setEditableProjects] = useState<Project[]>([]);
  const [editableEducation, setEditableEducation] = useState<Education[]>([]);
  const [editableSkills, setEditableSkills] = useState<string[]>([]);
  const [highlightedSkills, setHighlightedSkills] = useState<Set<string>>(new Set());
  const [editableLanguages, setEditableLanguages] = useState<string[]>([]);

  // Edit mode tracking per section
  const [editingExpIdx, setEditingExpIdx] = useState<number | null>(null);
  const [editingProjIdx, setEditingProjIdx] = useState<number | null>(null);
  const [editingEduIdx, setEditingEduIdx] = useState<number | null>(null);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingLanguages, setEditingLanguages] = useState(false);

  // Analyze state
  const [analyzingExpIdx, setAnalyzingExpIdx] = useState<number | null>(null);
  const [bulletScores, setBulletScores] = useState<Map<string, BulletScore[]>>(new Map());

  const fetchParsedData = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/parse-resume');
      const data = await res.json();
      setParsedData(data);
      // Initialize editable state
      if (data?.data) {
        setEditableExperience(data.data.experience || []);
        setEditableProjects(data.data.projects || []);
        setEditableEducation(data.data.education || []);
        setEditableSkills(data.data.skills || []);
        setEditableLanguages(data.data.languages || []);
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then((r) => r.json()),
      fetch('/api/profile/resume').then((r) => r.json()),
      fetchParsedData(),
    ])
      .then(([profileData, resumeData]) => {
        if (profileData?.name) {
          setForm({
            name: profileData.name,
            email: profileData.email ?? '',
            phone: profileData.phone ?? '',
            location: profileData.location ?? '',
            work_authorization: profileData.workAuthorization ?? 'OTHER',
            linkedin_url: profileData.linkedinUrl ?? '',
            github_url: profileData.githubUrl ?? '',
            portfolio_url: profileData.portfolioUrl ?? '',
          });
          // Load highlighted skills from profile
          if (profileData.highlightedSkills && Array.isArray(profileData.highlightedSkills)) {
            setHighlightedSkills(new Set(profileData.highlightedSkills));
          }
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
  }, [fetchParsedData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: editableExperience,
          projects: editableProjects,
          education: editableEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async () => {
    setSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experience: editableExperience,
          projects: editableProjects,
          education: editableEducation,
          skills: editableSkills,
          highlighted_skills: Array.from(highlightedSkills),
          languages: editableLanguages,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
        setShowTerminal(true);
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
      setParsedData({ parsed: false });
    } catch {
      // ignore
    }
  };

  const handleParseResume = () => {
    setShowTerminal(true);
  };

  const handleParsingComplete = async () => {
    const parsed = await fetchParsedData();
    if (parsed?.data?.basicInfo) {
      setForm((f) => ({
        ...f,
        name: parsed.data.basicInfo.name || f.name,
        email: parsed.data.basicInfo.email || f.email,
        phone: parsed.data.basicInfo.phone || f.phone,
        location: parsed.data.basicInfo.location || f.location,
        linkedin_url: parsed.data.basicInfo.linkedinUrl || f.linkedin_url,
        github_url: parsed.data.basicInfo.githubUrl || f.github_url,
        portfolio_url: parsed.data.basicInfo.portfolioUrl || f.portfolio_url,
      }));
    }
    setShowTerminal(false);
  };

  const handleAnalyzeExperience = async (expIdx: number) => {
    setAnalyzingExpIdx(expIdx);
    const exp = editableExperience[expIdx];

    try {
      const res = await fetch('/api/profile/analyze-bullets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: exp.company,
          title: exp.title,
          bullets: exp.bullets || [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBulletScores((prev) => new Map(prev).set(`exp-${expIdx}`, data.scores));
      }
    } catch {
      // ignore
    } finally {
      setAnalyzingExpIdx(null);
    }
  };

  const toggleSkillHighlight = (skill: string) => {
    setHighlightedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  const removeSkill = (skill: string) => {
    setEditableSkills((prev) => prev.filter((s) => s !== skill));
    setHighlightedSkills((prev) => {
      const next = new Set(prev);
      next.delete(skill);
      return next;
    });
  };

  if (loading) return <p>Loading profile…</p>;

  const complete = isProfileComplete(form, resume);
  const hasParsedData = parsedData.parsed && parsedData.data;

  return (
    <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
      {/* Header with Edit Button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Profile</h1>
        {resume.hasResume && (
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            style={{
              ...buttonStyle,
              background: isEditing ? 'var(--muted)' : 'var(--accent)',
            }}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

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

      {/* Resume Upload Section */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Resume</h2>
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
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <strong style={{ color: '#22c55e' }}>Resume uploaded</strong>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {resume.filename}
                  {parsedData.parsed && parsedData.parsedAt && !showTerminal && (
                    <> · Parsed {new Date(parsedData.parsedAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!showTerminal && (
                  <button
                    type="button"
                    onClick={handleParseResume}
                    style={{ ...smallButtonStyle, background: 'var(--accent)', color: 'white' }}
                  >
                    {parsedData.parsed ? 'Re-parse' : 'Parse'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeleteResume}
                  style={smallButtonStyle}
                  disabled={showTerminal}
                >
                  Remove
                </button>
              </div>
            </div>
            <ParsingTerminal isActive={showTerminal} onComplete={handleParsingComplete} />
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
              {uploading ? 'Uploading…' : 'Click to upload resume (PDF, DOCX, DOC, TXT - Max 10MB)'}
            </label>
            {uploadError && (
              <p style={{ color: '#ef4444', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                {uploadError}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Basic Info Section */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Basic Info</h2>
        {isEditing ? (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
              <label>
                LinkedIn URL
                <input
                  type="url"
                  value={form.linkedin_url}
                  onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://linkedin.com/in/..."
                />
              </label>
              <label>
                GitHub URL
                <input
                  type="url"
                  value={form.github_url}
                  onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://github.com/..."
                />
              </label>
              <label>
                Portfolio URL
                <input
                  type="url"
                  value={form.portfolio_url}
                  onChange={(e) => setForm((f) => ({ ...f, portfolio_url: e.target.value }))}
                  style={inputStyle}
                  placeholder="https://..."
                />
              </label>
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}
            >
              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
              {saved && <span style={{ color: '#22c55e', fontSize: '0.9rem' }}>Saved!</span>}
            </div>
          </form>
        ) : (
          <div style={{ ...cardStyle }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <InfoRow label="Name" value={form.name} />
              <InfoRow label="Email" value={form.email} />
              <InfoRow label="Phone" value={form.phone} />
              <InfoRow label="Location" value={form.location} />
              <InfoRow
                label="Work Authorization"
                value={form.work_authorization.replace(/_/g, ' ')}
              />
              {form.linkedin_url && <InfoRow label="LinkedIn" value={form.linkedin_url} isLink />}
              {form.github_url && <InfoRow label="GitHub" value={form.github_url} isLink />}
              {form.portfolio_url && (
                <InfoRow label="Portfolio" value={form.portfolio_url} isLink />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Parsed Resume Data */}
      {hasParsedData && !isEditing && (
        <>
          {/* Education */}
          {editableEducation.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Education</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editableEducation.map((edu, idx) => (
                  <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => setEditingEduIdx(editingEduIdx === idx ? null : idx)}
                      style={{
                        ...iconButtonStyle,
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        color: editingEduIdx === idx ? '#3b82f6' : 'var(--muted)',
                      }}
                      title="Edit"
                    >
                      <EditIcon />
                    </button>

                    {editingEduIdx === idx ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}
                        >
                          <input
                            type="text"
                            value={edu.institution}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, institution: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Institution"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.degree || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, degree: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Degree"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.field || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, field: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Field of Study"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.gpa || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, gpa: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="GPA"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.start_date || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, start_date: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="Start Date"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={edu.end_date || ''}
                            onChange={(e) => {
                              const updated = [...editableEducation];
                              updated[idx] = { ...edu, end_date: e.target.value };
                              setEditableEducation(updated);
                            }}
                            placeholder="End Date"
                            style={inputStyle}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEduIdx(null);
                            saveSection();
                          }}
                          style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingRight: '2rem',
                          }}
                        >
                          <div>
                            <strong>{edu.institution}</strong>
                            {(edu.degree || edu.field) && (
                              <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text)' }}>
                                {[edu.degree, edu.field].filter(Boolean).join(' in ')}
                              </p>
                            )}
                            {edu.gpa && (
                              <p
                                style={{
                                  margin: '0.25rem 0 0 0',
                                  color: 'var(--muted)',
                                  fontSize: '0.9rem',
                                }}
                              >
                                GPA: {edu.gpa}
                              </p>
                            )}
                          </div>
                          {(edu.start_date || edu.end_date) && (
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                              {edu.start_date} - {edu.end_date || 'Present'}
                            </span>
                          )}
                        </div>
                        {edu.coursework && edu.coursework.length > 0 && (
                          <p
                            style={{
                              marginTop: '0.5rem',
                              fontSize: '0.85rem',
                              color: 'var(--muted)',
                            }}
                          >
                            <strong>Coursework:</strong> {edu.coursework.join(', ')}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Work Experience */}
          {editableExperience.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Work Experience</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editableExperience.map((exp, idx) => (
                  <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
                    {/* Action Buttons */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        display: 'flex',
                        gap: '0.5rem',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingExpIdx(editingExpIdx === idx ? null : idx)}
                        style={{
                          ...iconButtonStyle,
                          color: editingExpIdx === idx ? '#3b82f6' : 'var(--muted)',
                        }}
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnalyzeExperience(idx)}
                        disabled={analyzingExpIdx === idx}
                        style={{
                          ...iconButtonStyle,
                          color: bulletScores.has(`exp-${idx}`) ? '#22c55e' : 'var(--muted)',
                        }}
                        title="Analyze bullet points"
                      >
                        {analyzingExpIdx === idx ? (
                          <span style={{ fontSize: '12px' }}>...</span>
                        ) : (
                          <AnalyzeIcon />
                        )}
                      </button>
                    </div>

                    {editingExpIdx === idx ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}
                        >
                          <input
                            type="text"
                            value={exp.title}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = { ...exp, title: e.target.value };
                              setEditableExperience(updated);
                            }}
                            placeholder="Job Title"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = { ...exp, company: e.target.value };
                              setEditableExperience(updated);
                            }}
                            placeholder="Company"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={exp.location || ''}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = { ...exp, location: e.target.value };
                              setEditableExperience(updated);
                            }}
                            placeholder="Location"
                            style={inputStyle}
                          />
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="text"
                              value={exp.start_date || ''}
                              onChange={(e) => {
                                const updated = [...editableExperience];
                                updated[idx] = { ...exp, start_date: e.target.value };
                                setEditableExperience(updated);
                              }}
                              placeholder="Start Date"
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <input
                              type="text"
                              value={exp.end_date || ''}
                              onChange={(e) => {
                                const updated = [...editableExperience];
                                updated[idx] = { ...exp, end_date: e.target.value };
                                setEditableExperience(updated);
                              }}
                              placeholder="End Date"
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                            Bullet Points (one per line)
                          </label>
                          <textarea
                            value={(exp.bullets || []).join('\n')}
                            onChange={(e) => {
                              const updated = [...editableExperience];
                              updated[idx] = {
                                ...exp,
                                bullets: e.target.value.split('\n').filter((b) => b.trim()),
                              };
                              setEditableExperience(updated);
                            }}
                            style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpIdx(null);
                            saveSection();
                          }}
                          style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingRight: '4rem',
                          }}
                        >
                          <div>
                            <strong>{exp.title}</strong>
                            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text)' }}>
                              {exp.company}
                              {exp.location && (
                                <span style={{ color: 'var(--muted)' }}> · {exp.location}</span>
                              )}
                            </p>
                          </div>
                          {(exp.start_date || exp.end_date) && (
                            <span
                              style={{
                                color: 'var(--muted)',
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {exp.start_date} - {exp.end_date || 'Present'}
                            </span>
                          )}
                        </div>
                        {exp.bullets && exp.bullets.length > 0 && (
                          <ul
                            style={{
                              marginTop: '0.75rem',
                              paddingLeft: '1.25rem',
                              marginBottom: 0,
                            }}
                          >
                            {exp.bullets.map((bullet, bidx) => {
                              const scores = bulletScores.get(`exp-${idx}`);
                              const score = scores?.[bidx];
                              return (
                                <li
                                  key={bidx}
                                  style={{
                                    fontSize: '0.9rem',
                                    marginBottom: '0.5rem',
                                    color: 'var(--text)',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ flex: 1 }}>{bullet}</span>
                                    {score && (
                                      <span
                                        style={{
                                          fontSize: '0.75rem',
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: 4,
                                          background:
                                            score.score >= 4
                                              ? 'rgba(34, 197, 94, 0.15)'
                                              : score.score >= 3
                                                ? 'rgba(234, 179, 8, 0.15)'
                                                : 'rgba(239, 68, 68, 0.15)',
                                          color:
                                            score.score >= 4
                                              ? '#22c55e'
                                              : score.score >= 3
                                                ? '#eab308'
                                                : '#ef4444',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={score.feedback}
                                      >
                                        {score.score}/5
                                      </span>
                                    )}
                                  </div>
                                  {score && (
                                    <p
                                      style={{
                                        margin: '0.25rem 0 0 0',
                                        fontSize: '0.8rem',
                                        color: 'var(--muted)',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      {score.feedback}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects */}
          {editableProjects.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Projects</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {editableProjects.map((proj, idx) => (
                  <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => setEditingProjIdx(editingProjIdx === idx ? null : idx)}
                      style={{
                        ...iconButtonStyle,
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        color: editingProjIdx === idx ? '#3b82f6' : 'var(--muted)',
                      }}
                      title="Edit"
                    >
                      <EditIcon />
                    </button>

                    {editingProjIdx === idx ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}
                        >
                          <input
                            type="text"
                            value={proj.name}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = { ...proj, name: e.target.value };
                              setEditableProjects(updated);
                            }}
                            placeholder="Project Name"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={proj.context || ''}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = { ...proj, context: e.target.value };
                              setEditableProjects(updated);
                            }}
                            placeholder="Context (e.g., Hackathon, Personal)"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={proj.dates || ''}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = { ...proj, dates: e.target.value };
                              setEditableProjects(updated);
                            }}
                            placeholder="Dates"
                            style={inputStyle}
                          />
                          <input
                            type="text"
                            value={(proj.technologies || []).join(', ')}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = {
                                ...proj,
                                technologies: e.target.value.split(',').map((t) => t.trim()),
                              };
                              setEditableProjects(updated);
                            }}
                            placeholder="Technologies (comma separated)"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                            Bullet Points (one per line)
                          </label>
                          <textarea
                            value={(proj.bullets || []).join('\n')}
                            onChange={(e) => {
                              const updated = [...editableProjects];
                              updated[idx] = {
                                ...proj,
                                bullets: e.target.value.split('\n').filter((b) => b.trim()),
                              };
                              setEditableProjects(updated);
                            }}
                            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjIdx(null);
                            saveSection();
                          }}
                          style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingRight: '2rem',
                          }}
                        >
                          <div>
                            <strong>{proj.name}</strong>
                            {proj.context && (
                              <span style={{ color: 'var(--muted)', marginLeft: '0.5rem' }}>
                                ({proj.context})
                              </span>
                            )}
                          </div>
                          {proj.dates && (
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                              {proj.dates}
                            </span>
                          )}
                        </div>
                        {proj.achievements && proj.achievements.length > 0 && (
                          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#22c55e' }}>
                            {proj.achievements.join(' · ')}
                          </p>
                        )}
                        {proj.technologies && proj.technologies.length > 0 && (
                          <p
                            style={{
                              marginTop: '0.5rem',
                              fontSize: '0.85rem',
                              color: 'var(--muted)',
                            }}
                          >
                            <strong>Tech:</strong> {proj.technologies.join(', ')}
                          </p>
                        )}
                        {proj.bullets && proj.bullets.length > 0 && (
                          <ul
                            style={{
                              marginTop: '0.75rem',
                              paddingLeft: '1.25rem',
                              marginBottom: 0,
                            }}
                          >
                            {proj.bullets.map((bullet, bidx) => (
                              <li
                                key={bidx}
                                style={{
                                  fontSize: '0.9rem',
                                  marginBottom: '0.25rem',
                                  color: 'var(--text)',
                                }}
                              >
                                {bullet}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skills */}
          {editableSkills.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Skills</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (editingSkills) {
                      saveSection();
                    }
                    setEditingSkills(!editingSkills);
                  }}
                  style={{
                    ...iconButtonStyle,
                    color: editingSkills ? '#3b82f6' : 'var(--muted)',
                  }}
                  title={editingSkills ? 'Done editing' : 'Edit skills'}
                >
                  <EditIcon />
                </button>
              </div>
              <div style={cardStyle}>
                {editingSkills && (
                  <p
                    style={{
                      margin: '0 0 0.75rem 0',
                      fontSize: '0.8rem',
                      color: 'var(--muted)',
                    }}
                  >
                    Click a skill to highlight it as a strength. Hover and click X to remove.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {editableSkills.map((skill, idx) => (
                    <span
                      key={idx}
                      onClick={() => toggleSkillHighlight(skill)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        paddingRight: editingSkills ? '0.5rem' : '0.75rem',
                        background: highlightedSkills.has(skill)
                          ? 'rgba(34, 197, 94, 0.15)'
                          : 'rgba(59, 130, 246, 0.1)',
                        border: `1px solid ${highlightedSkills.has(skill) ? 'rgba(34, 197, 94, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`,
                        borderRadius: '9999px',
                        fontSize: '0.85rem',
                        color: highlightedSkills.has(skill) ? '#22c55e' : '#3b82f6',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {highlightedSkills.has(skill) && <span>★</span>}
                      {skill}
                      {editingSkills && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSkill(skill);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '0 0.25rem',
                            cursor: 'pointer',
                            color: '#ef4444',
                            opacity: 0.7,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Remove skill"
                        >
                          <XIcon />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {editingSkills && (
                  <div style={{ marginTop: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Add new skill and press Enter"
                      style={inputStyle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.currentTarget;
                          const value = input.value.trim();
                          if (value && !editableSkills.includes(value)) {
                            setEditableSkills([...editableSkills, value]);
                            input.value = '';
                          }
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Languages */}
          {(editableLanguages.length > 0 || editingLanguages) && (
            <section style={{ marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Languages</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (editingLanguages) {
                      saveSection();
                    }
                    setEditingLanguages(!editingLanguages);
                  }}
                  style={{
                    ...iconButtonStyle,
                    color: editingLanguages ? '#3b82f6' : 'var(--muted)',
                  }}
                  title={editingLanguages ? 'Done editing' : 'Edit languages'}
                >
                  <EditIcon />
                </button>
              </div>
              <div style={cardStyle}>
                {editingLanguages ? (
                  <input
                    type="text"
                    value={editableLanguages.join(', ')}
                    onChange={(e) => {
                      setEditableLanguages(
                        e.target.value
                          .split(',')
                          .map((l) => l.trim())
                          .filter(Boolean),
                      );
                    }}
                    placeholder="Languages (comma separated)"
                    style={inputStyle}
                  />
                ) : (
                  <p style={{ margin: 0 }}>{editableLanguages.join(', ')}</p>
                )}
              </div>
            </section>
          )}

          {/* Certifications */}
          {parsedData.data?.certifications && parsedData.data.certifications.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Certifications</h2>
              <div style={cardStyle}>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {parsedData.data.certifications.map((cert, idx) => (
                    <li key={idx} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {cert}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value: string; isLink?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{label}</span>
      {isLink ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.95rem',
          }}
        >
          {value}
        </a>
      ) : (
        <p style={{ margin: 0, fontSize: '0.95rem' }}>{value}</p>
      )}
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
  boxSizing: 'border-box',
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

const smallButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0.25rem',
  cursor: 'pointer',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.15s ease',
};
