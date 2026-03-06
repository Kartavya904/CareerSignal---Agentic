'use client';

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../components/ToastContext';
import { useReportAction } from '../components/UserActivityProvider';
import { COUNTRY_NAMES, getStatesForCountry } from '@/lib/location-data';
import type { PreferencesPutBody, TargetLocationInput } from '@careersignal/schemas';

const WORK_AUTH_OPTIONS = ['US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER'] as const;
const REMOTE_OPTIONS = ['REMOTE', 'HYBRID', 'ONSITE', 'ANY'] as const;
const SENIORITY_OPTIONS = [
  'INTERN',
  'ENTRY',
  'JUNIOR',
  'MID',
  'SENIOR',
  'STAFF',
  'PRINCIPAL',
  'DIRECTOR',
  'VP',
  'C_LEVEL',
] as const;
const EMPLOYMENT_TYPES = [
  'INTERNSHIP',
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'UNKNOWN',
] as const;
const STRICT_OPTIONS = ['STRICT', 'SEMI_STRICT', 'OFF'] as const;
const MAX_CONTACTS_OPTIONS = [1, 2, 3, 5] as const;

// Unified tone options for cover letter and cold messages (user wanted same options in both)
const TONE_OPTIONS = [
  'Formal',
  'Professional',
  'Conversational',
  'Friendly',
  'Confident',
  'Bold',
  'Warm',
  'Straightforward',
  'Polite',
  'Enthusiastic',
  'Understated',
  'Direct',
  'Personal',
  'Technical',
  'Narrative',
  'Action-oriented',
  'Modest',
  'Industry-specific',
  'Traditional',
  'Hook-led',
  'Concise',
  'Low-key',
  'Personable',
] as const;

const COVER_LETTER_LENGTH_OPTIONS = [
  { value: 'CONCISE', label: 'Concise' },
  { value: 'DEFAULT', label: 'Default' },
  { value: 'DETAILED', label: 'Detailed' },
] as const;

const COLD_MESSAGE_LENGTH_OPTIONS = [
  { value: 'VERY_SHORT', label: 'Very short' },
  { value: 'SHORT', label: 'Short' },
  { value: 'MEDIUM', label: 'Medium' },
] as const;

const COVER_LETTER_WORD_CHOICE_OPTIONS = [
  'Action-oriented',
  'Modest',
  'Confident',
  'Jargon-light',
  'Industry-specific',
] as const;

const tagPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.25rem 0.5rem',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  fontSize: '0.875rem',
  color: 'var(--text-secondary)',
};

type ApiPreferences = PreferencesPutBody & {
  id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  synced_from_profile_at?: string | null;
};

const defaultForm: PreferencesPutBody = {
  work_authorizations: ['OTHER'],
  target_locations: [],
  willing_to_relocate: false,
  has_car: false,
  remote_preference: 'ANY',
  target_seniority: [],
  target_roles: [],
  skills: [],
  industries: [],
  employment_types: ['FULL_TIME'],
  salary_min: undefined,
  salary_max: undefined,
  salary_currency: null,
  strict_filter_level: 'STRICT',
  max_contacts_per_job: 2,
  email_updates_enabled: false,
  email_min_match_score: 60,
  outreach_tone: null,
  cover_letter_tone: [],
  cover_letter_length: 'DEFAULT',
  cover_letter_word_choice: [],
  cover_letter_notes: null,
  cold_linkedin_tone: [],
  cold_linkedin_length: 'SHORT',
  cold_linkedin_notes: null,
  cold_email_tone: [],
  cold_email_length: 'SHORT',
  cold_email_notes: null,
};

export default function PreferencesPage() {
  const { addToast } = useToast();
  const reportAction = useReportAction();
  const [form, setForm] = useState<PreferencesPutBody>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autofillRolesLoading, setAutofillRolesLoading] = useState(false);
  const [autofillFromProfileLoading, setAutofillFromProfileLoading] = useState(false);

  const load = useCallback(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((data: ApiPreferences | null | { error?: string }) => {
        if (data && typeof data === 'object' && !('error' in data)) {
          const d = data as ApiPreferences;
          setForm({
            work_authorizations:
              (d as ApiPreferences).work_authorizations ?? defaultForm.work_authorizations,
            target_locations: d.target_locations ?? [],
            willing_to_relocate: d.willing_to_relocate ?? false,
            has_car: d.has_car ?? false,
            remote_preference: d.remote_preference ?? 'ANY',
            target_seniority: d.target_seniority ?? [],
            target_roles: d.target_roles ?? [],
            skills: d.skills ?? [],
            industries: d.industries ?? [],
            employment_types: d.employment_types ?? [],
            salary_min: d.salary_min ?? undefined,
            salary_max: d.salary_max ?? undefined,
            salary_currency: d.salary_currency ?? null,
            strict_filter_level: d.strict_filter_level ?? 'STRICT',
            max_contacts_per_job: d.max_contacts_per_job ?? 2,
            email_updates_enabled: d.email_updates_enabled ?? false,
            email_min_match_score: d.email_min_match_score ?? null,
            outreach_tone: d.outreach_tone ?? null,
            cover_letter_tone: (d as ApiPreferences).cover_letter_tone ?? [],
            cover_letter_length: (d as ApiPreferences).cover_letter_length ?? 'DEFAULT',
            cover_letter_word_choice: (d as ApiPreferences).cover_letter_word_choice ?? [],
            cover_letter_notes: (d as ApiPreferences).cover_letter_notes ?? null,
            cold_linkedin_tone: (d as ApiPreferences).cold_linkedin_tone ?? [],
            cold_linkedin_length: (d as ApiPreferences).cold_linkedin_length ?? 'SHORT',
            cold_linkedin_notes: (d as ApiPreferences).cold_linkedin_notes ?? null,
            cold_email_tone: (d as ApiPreferences).cold_email_tone ?? [],
            cold_email_length: (d as ApiPreferences).cold_email_length ?? 'SHORT',
            cold_email_notes: (d as ApiPreferences).cold_email_notes ?? null,
          });
        }
      })
      .catch(() => addToast('Failed to load preferences', 'error'))
      .finally(() => setLoading(false));
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      target_locations: form.target_locations.filter((loc) => loc.country?.trim()),
    };
    setSaving(true);
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          addToast(data.error, 'error');
          return;
        }
        addToast('Preferences saved', 'success');
        reportAction('save_preferences', {});
      })
      .catch(() => addToast('Failed to save', 'error'))
      .finally(() => setSaving(false));
  };

  const addLocation = () => {
    setForm((f) => ({
      ...f,
      target_locations: [...f.target_locations, { country: '' }],
    }));
  };

  const updateLocation = (index: number, upd: Partial<TargetLocationInput>) => {
    setForm((f) => ({
      ...f,
      target_locations: f.target_locations.map((loc, i) =>
        i === index ? { ...loc, ...upd } : loc,
      ),
    }));
  };

  const removeLocation = (index: number) => {
    setForm((f) => ({
      ...f,
      target_locations: f.target_locations.filter((_, i) => i !== index),
    }));
  };

  const addTag = (key: 'target_roles' | 'skills' | 'industries', value: string) => {
    const v = value.trim();
    if (!v) return;
    setForm((f) => ({
      ...f,
      [key]: [...(f[key] ?? []), v],
    }));
  };

  const removeTag = (key: 'target_roles' | 'skills' | 'industries', index: number) => {
    setForm((f) => ({
      ...f,
      [key]: (f[key] ?? []).filter((_, i) => i !== index),
    }));
  };

  const autofillRoles = () => {
    setAutofillRolesLoading(true);
    fetch('/api/preferences/autofill-roles', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.target_roles?.length) {
          setForm((f) => ({ ...f, target_roles: data.target_roles }));
          addToast(`Added ${data.target_roles.length} suggested roles`, 'success');
        } else {
          addToast('No roles suggested from profile', 'info');
        }
      })
      .catch(() => addToast('Failed to autofill roles', 'error'))
      .finally(() => setAutofillRolesLoading(false));
  };

  const autofillFromProfile = () => {
    setAutofillFromProfileLoading(true);
    fetch('/api/preferences/autofill-from-profile', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          addToast(data.error, 'error');
          return;
        }
        setForm({
          work_authorizations: data.work_authorizations ?? form.work_authorizations,
          target_locations: data.target_locations ?? [],
          willing_to_relocate: data.willing_to_relocate ?? false,
          has_car: data.has_car ?? false,
          remote_preference: data.remote_preference ?? 'ANY',
          target_seniority: data.target_seniority ?? [],
          target_roles: data.target_roles ?? [],
          skills: data.skills ?? [],
          industries: data.industries ?? [],
          employment_types: data.employment_types ?? [],
          salary_min: data.salary_min ?? undefined,
          salary_max: data.salary_max ?? undefined,
          salary_currency: data.salary_currency ?? null,
          strict_filter_level: data.strict_filter_level ?? 'STRICT',
          max_contacts_per_job: data.max_contacts_per_job ?? 2,
          outreach_tone: data.outreach_tone ?? null,
          cover_letter_tone: data.cover_letter_tone ?? [],
          cover_letter_length: data.cover_letter_length ?? 'DEFAULT',
          cover_letter_word_choice: data.cover_letter_word_choice ?? [],
          cover_letter_notes: data.cover_letter_notes ?? null,
          cold_linkedin_tone: data.cold_linkedin_tone ?? [],
          cold_linkedin_length: data.cold_linkedin_length ?? 'SHORT',
          cold_linkedin_notes: data.cold_linkedin_notes ?? null,
          cold_email_tone: data.cold_email_tone ?? [],
          cold_email_length: data.cold_email_length ?? 'SHORT',
          cold_email_notes: data.cold_email_notes ?? null,
          email_updates_enabled: data.email_updates_enabled ?? false,
          email_min_match_score: data.email_min_match_score ?? 60,
        });
        addToast('Preferences filled from profile. Review and save.', 'success');
      })
      .catch(() => addToast('Failed to load from profile', 'error'))
      .finally(() => setAutofillFromProfileLoading(false));
  };

  if (loading) {
    return (
      <div className="page-head">
        <h1>Preferences</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Loading preferences…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <h1>Preferences</h1>
        <p>Job search and ranking preferences. Used for scoring and filtering results.</p>
      </div>

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '1.25rem',
            }}
          >
            <button
              type="button"
              onClick={autofillFromProfile}
              disabled={autofillFromProfileLoading}
              className="btn btn-primary"
            >
              {autofillFromProfileLoading ? 'Loading…' : 'Auto-populate from profile'}
            </button>
            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
              Overwrites fields from your profile. Review and save.
            </span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Basics
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Work authorization *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {WORK_AUTH_OPTIONS.map((o) => {
                const selected = form.work_authorizations.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        work_authorizations: selected
                          ? f.work_authorizations.filter((x) => x !== o)
                          : [...f.work_authorizations, o],
                      }));
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: 8,
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                      color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      fontWeight: selected ? 600 : 500,
                      cursor: 'pointer',
                      transition:
                        'border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {o.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
            <p
              style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.35rem' }}
            >
              Select all that apply. At least one required.
            </p>
          </div>
          <div>
            <label className="label">Employment types *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {EMPLOYMENT_TYPES.map((t) => {
                const selected = form.employment_types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        employment_types: selected
                          ? f.employment_types.filter((x) => x !== t)
                          : [...f.employment_types, t],
                      }));
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: 8,
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                      color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      fontWeight: selected ? 600 : 500,
                      cursor: 'pointer',
                      transition:
                        'border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {t.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Locations
          </h2>
          <div style={{ marginBottom: '0.75rem' }}>
            <label className="label">Willing to relocate?</label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="radio"
                  name="willing_to_relocate"
                  checked={form.willing_to_relocate === true}
                  onChange={() => setForm((f) => ({ ...f, willing_to_relocate: true }))}
                />
                <span>Yes</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="radio"
                  name="willing_to_relocate"
                  checked={form.willing_to_relocate === false}
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      willing_to_relocate: false,
                      has_car: false,
                    }))
                  }
                />
                <span>No</span>
              </label>
            </div>
            {form.willing_to_relocate && (
              <div style={{ marginTop: '0.5rem' }}>
                <label
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  className="label"
                >
                  <input
                    type="checkbox"
                    checked={form.has_car === true}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        has_car: e.target.checked,
                      }))
                    }
                  />
                  <span>I have a car for commuting</span>
                </label>
              </div>
            )}
          </div>
          <p style={{ color: 'var(--accent)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Target locations: country required; state and city optional. No city without state.
          </p>
          {form.target_locations.map((loc, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
              }}
            >
              <select
                className="select"
                value={loc.country}
                onChange={(e) =>
                  updateLocation(i, { country: e.target.value, state: undefined, city: undefined })
                }
                style={{ width: 'auto', minWidth: '10rem' }}
                required
              >
                <option value="">Select country</option>
                {COUNTRY_NAMES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {loc.country && getStatesForCountry(loc.country).length > 0 && (
                <select
                  className="select"
                  value={loc.state ?? ''}
                  onChange={(e) =>
                    updateLocation(i, { state: e.target.value || undefined, city: undefined })
                  }
                  style={{ width: 'auto', minWidth: '8rem' }}
                >
                  <option value="">State (optional)</option>
                  {getStatesForCountry(loc.country).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                className="input"
                placeholder="City (optional)"
                value={loc.city ?? ''}
                onChange={(e) => updateLocation(i, { city: e.target.value || undefined })}
                style={{ width: '8rem' }}
                disabled={!loc.state}
              />
              <button
                type="button"
                onClick={() => removeLocation(i)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.875rem' }}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLocation}
            className="btn btn-ghost"
            style={{ border: '1px dashed var(--border)', padding: '0.5rem 0.75rem' }}
          >
            + Add location
          </button>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Work preferences
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Remote preference</label>
            <select
              className="select"
              value={form.remote_preference}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  remote_preference: e.target.value as typeof f.remote_preference,
                }))
              }
            >
              {REMOTE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Target seniority</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {SENIORITY_OPTIONS.map((s) => {
                const selected = form.target_seniority.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        target_seniority: selected
                          ? f.target_seniority.filter((x) => x !== s)
                          : [...f.target_seniority, s],
                      }));
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: 8,
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                      color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      fontWeight: selected ? 600 : 500,
                      cursor: 'pointer',
                      transition:
                        'border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Roles & skills
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Target roles</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input"
                placeholder="Type and press Enter"
                style={{ flex: '1 1 12rem' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('target_roles', (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={autofillRoles}
                disabled={autofillRolesLoading}
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                {autofillRolesLoading ? '…' : 'Autofill from profile'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
              {form.target_roles.map((r, i) => (
                <span key={i} style={tagPillStyle}>
                  {r}
                  <button
                    type="button"
                    onClick={() => removeTag('target_roles', i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                      color: 'var(--muted-foreground)',
                    }}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Skills</label>
            <input
              type="text"
              className="input"
              placeholder="Type and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag('skills', (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
              {form.skills.map((s, i) => (
                <span key={i} style={tagPillStyle}>
                  {s}
                  <button
                    type="button"
                    onClick={() => removeTag('skills', i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                      color: 'var(--muted-foreground)',
                    }}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Salary (optional)
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="number"
              className="input"
              placeholder="Min"
              value={form.salary_min ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  salary_min: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              style={{ width: '6rem' }}
            />
            <input
              type="number"
              className="input"
              placeholder="Max"
              value={form.salary_max ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  salary_max: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              style={{ width: '6rem' }}
            />
            <input
              type="text"
              className="input"
              placeholder="Currency (e.g. USD)"
              value={form.salary_currency ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, salary_currency: e.target.value || null }))}
              style={{ width: '6rem' }}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Filter & outreach
          </h2>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Strict filter</label>
            <select
              className="select"
              value={form.strict_filter_level}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  strict_filter_level: e.target.value as typeof f.strict_filter_level,
                }))
              }
            >
              {STRICT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <p
              style={{
                color: 'var(--muted-foreground)',
                fontSize: '0.85rem',
                marginTop: '0.35rem',
              }}
            >
              Strict: exclude jobs that fail visa, location, or seniority. Semi-strict: exclude only
              when two or more fail. Off: show all jobs.
            </p>
          </div>
          <div>
            <label className="label">Max contacts per job</label>
            <select
              className="select"
              value={form.max_contacts_per_job}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  max_contacts_per_job: Number(e.target.value) as 1 | 2 | 3 | 5,
                }))
              }
            >
              {MAX_CONTACTS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Email preferences
          </h2>
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                color: 'var(--text)',
              }}
            >
              <input
                type="checkbox"
                checked={form.email_updates_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email_updates_enabled: e.target.checked }))
                }
              />
              <span>Send me email updates for each Application Assistant analysis.</span>
            </label>
            <p
              style={{
                color: 'var(--muted-foreground)',
                fontSize: '0.8rem',
                marginTop: '0.35rem',
              }}
            >
              When enabled, a future email agent will summarize the analysis, attach the cover
              letter, and email it to you — but only when the match score meets your minimum
              threshold.
            </p>
            <div style={{ marginTop: '0.5rem', maxWidth: 220 }}>
              <label className="label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Minimum match score (0–100)
              </label>
              <input
                type="number"
                className="input"
                min={0}
                max={100}
                step={1}
                disabled={!form.email_updates_enabled}
                value={form.email_min_match_score ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) {
                    setForm((f) => ({ ...f, email_min_match_score: null }));
                    return;
                  }
                  const n = Number(raw);
                  if (Number.isNaN(n)) return;
                  const clamped = Math.min(100, Math.max(0, n));
                  setForm((f) => ({ ...f, email_min_match_score: clamped }));
                }}
              />
              <p
                style={{
                  color: 'var(--muted-foreground)',
                  fontSize: '0.75rem',
                  marginTop: '0.25rem',
                }}
              >
                The email agent will only send updates for analyses with a match score greater than
                or equal to this value.
              </p>
            </div>
          </div>
        </div>

        {/* Tone preferences: Cover letter, Cold message (LinkedIn), Cold email */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2
            className="section-title"
            style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: '0' }}
          >
            Tone preferences
          </h2>
          <p
            style={{
              color: 'var(--muted-foreground)',
              fontSize: '0.9rem',
              marginBottom: '1.25rem',
            }}
          >
            How you want cover letters and outreach messages to sound. Used by Application
            Assistant.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '1.5rem',
            }}
          >
            {/* 1. Cover letter */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Cover letter
              </h3>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Tone (multi-select)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {TONE_OPTIONS.map((t) => {
                    const selected = form.cover_letter_tone.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cover_letter_tone: selected
                              ? f.cover_letter_tone.filter((x) => x !== t)
                              : [...f.cover_letter_tone, t],
                          }))
                        }
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: 6,
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                          color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: selected ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Length (choose one)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {COVER_LETTER_LENGTH_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cover_letter_length: value }))}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: 6,
                        border: `1px solid ${form.cover_letter_length === value ? 'var(--accent)' : 'var(--border)'}`,
                        background:
                          form.cover_letter_length === value
                            ? 'var(--accent-muted)'
                            : 'var(--surface-elevated)',
                        color:
                          form.cover_letter_length === value
                            ? 'var(--accent)'
                            : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: form.cover_letter_length === value ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Word choice (multi-select)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {COVER_LETTER_WORD_CHOICE_OPTIONS.map((w) => {
                    const selected = form.cover_letter_word_choice.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cover_letter_word_choice: selected
                              ? f.cover_letter_word_choice.filter((x) => x !== w)
                              : [...f.cover_letter_word_choice, w],
                          }))
                        }
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: 6,
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                          color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: selected ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">
                  Opening, structure, signature &amp; special requests
                </label>
                <textarea
                  className="input"
                  placeholder="e.g. Use 'Dear Hiring Team', keep to 3 paragraphs, sign with 'Best regards'..."
                  value={form.cover_letter_notes ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cover_letter_notes: e.target.value || null }))
                  }
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', minHeight: '4.5rem' }}
                />
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--muted-foreground)',
                    marginTop: '0.25rem',
                  }}
                >
                  Optional. We’ll try to keep this structure and closing in the generated cover
                  letter.
                </p>
              </div>
            </div>

            {/* 2. Cold message (LinkedIn) */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Cold message (LinkedIn)
              </h3>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Tone (multi-select)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {TONE_OPTIONS.map((t) => {
                    const selected = form.cold_linkedin_tone.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cold_linkedin_tone: selected
                              ? f.cold_linkedin_tone.filter((x) => x !== t)
                              : [...f.cold_linkedin_tone, t],
                          }))
                        }
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: 6,
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                          color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: selected ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Length (choose one)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {COLD_MESSAGE_LENGTH_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cold_linkedin_length: value }))}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: 6,
                        border: `1px solid ${form.cold_linkedin_length === value ? 'var(--accent)' : 'var(--border)'}`,
                        background:
                          form.cold_linkedin_length === value
                            ? 'var(--accent-muted)'
                            : 'var(--surface-elevated)',
                        color:
                          form.cold_linkedin_length === value
                            ? 'var(--accent)'
                            : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: form.cold_linkedin_length === value ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Opening, closing &amp; special requests</label>
                <textarea
                  className="input"
                  placeholder="e.g. Open with a one-line hook, no flattery, end with a soft ask..."
                  value={form.cold_linkedin_notes ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cold_linkedin_notes: e.target.value || null }))
                  }
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', minHeight: '4.5rem' }}
                />
              </div>
            </div>

            {/* 3. Cold email */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Cold email
              </h3>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Tone (multi-select)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {TONE_OPTIONS.map((t) => {
                    const selected = form.cold_email_tone.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cold_email_tone: selected
                              ? f.cold_email_tone.filter((x) => x !== t)
                              : [...f.cold_email_tone, t],
                          }))
                        }
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: 6,
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--accent-muted)' : 'var(--surface-elevated)',
                          color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: selected ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="label">Length (choose one)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {COLD_MESSAGE_LENGTH_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cold_email_length: value }))}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: 6,
                        border: `1px solid ${form.cold_email_length === value ? 'var(--accent)' : 'var(--border)'}`,
                        background:
                          form.cold_email_length === value
                            ? 'var(--accent-muted)'
                            : 'var(--surface-elevated)',
                        color:
                          form.cold_email_length === value
                            ? 'var(--accent)'
                            : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: form.cold_email_length === value ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Opening, closing &amp; special requests</label>
                <textarea
                  className="input"
                  placeholder="e.g. Subject line style, sign-off, keep under 150 words..."
                  value={form.cold_email_notes ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cold_email_notes: e.target.value || null }))
                  }
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', minHeight: '4.5rem' }}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary"
          style={{ fontSize: '0.9375rem' }}
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </form>
    </div>
  );
}
