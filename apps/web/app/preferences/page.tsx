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
  work_authorization: 'OTHER',
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
  outreach_tone: null,
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
            work_authorization: d.work_authorization ?? defaultForm.work_authorization,
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
            outreach_tone: d.outreach_tone ?? null,
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
          work_authorization: data.work_authorization ?? form.work_authorization,
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
            <select
              className="select"
              value={form.work_authorization}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  work_authorization: e.target.value as typeof f.work_authorization,
                }))
              }
              required
            >
              {WORK_AUTH_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
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
