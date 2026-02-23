import { describe, it, expect, vi } from 'vitest';

vi.mock('@careersignal/llm', () => ({
  complete: vi.fn().mockResolvedValue('[]'),
}));

import { buildPreferencesFromProfile, type ProfileData } from '@careersignal/agents';

const makeProfile = (overrides?: Partial<ProfileData>): ProfileData => ({
  name: 'John Doe',
  location: 'San Francisco, CA',
  workAuthorization: 'US Citizen',
  skills: ['TypeScript', 'React', 'Node.js', 'Python', 'AWS'],
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      startDate: '2020-01-01',
      endDate: 'Present',
    },
    {
      title: 'Software Engineer',
      company: 'TechStartup',
      startDate: '2018-06-01',
      endDate: '2019-12-31',
    },
  ],
  education: [
    {
      institution: 'Stanford University',
      degree: 'BS',
      field: 'Computer Science',
    },
  ],
  ...overrides,
});

describe('preference-builder-agent (code paths, no LLM)', () => {
  describe('buildPreferencesFromProfile', () => {
    it('returns preferences, suggestions, and confidence', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result).toHaveProperty('preferences');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('confidence');
    });

    it('maps US Citizen work authorization', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.preferences.workAuthorization).toBe('US_CITIZEN');
    });

    it('maps H1B work authorization', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({ workAuthorization: 'H1B Visa' }),
      );
      expect(result.preferences.workAuthorization).toBe('H1B');
    });

    it('maps Green Card work authorization', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({ workAuthorization: 'Permanent Resident / Green Card' }),
      );
      expect(result.preferences.workAuthorization).toBe('GREEN_CARD');
    });

    it('maps OPT work authorization', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({ workAuthorization: 'OPT/F-1' }),
      );
      expect(result.preferences.workAuthorization).toBe('OPT');
    });

    it('defaults to OTHER for unknown auth', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({ workAuthorization: undefined }),
      );
      expect(result.preferences.workAuthorization).toBe('OTHER');
    });

    it('sets strict filter for H1B/OPT', async () => {
      const h1b = await buildPreferencesFromProfile(makeProfile({ workAuthorization: 'H1B' }));
      expect(h1b.preferences.strictFilterLevel).toBe('STRICT');
    });

    it('sets OFF filter for citizens', async () => {
      const citizen = await buildPreferencesFromProfile(
        makeProfile({ workAuthorization: 'US Citizen' }),
      );
      expect(citizen.preferences.strictFilterLevel).toBe('OFF');
    });

    it('adds location as target location', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.preferences.targetLocations).toBeDefined();
      expect(result.preferences.targetLocations!.length).toBeGreaterThan(0);
    });

    it('infers target roles from experience', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.preferences.targetRoles).toBeDefined();
      expect(result.preferences.targetRoles!.length).toBeGreaterThan(0);
      expect(result.preferences.targetRoles).toContain('Software Engineer');
    });

    it('infers Frontend Engineer role from frontend title', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({
          experience: [
            {
              title: 'Frontend Developer',
              company: 'Co',
              startDate: '2020-01',
              endDate: 'Present',
            },
          ],
        }),
      );
      expect(result.preferences.targetRoles).toContain('Frontend Engineer');
    });

    it('infers seniority from years of experience', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.preferences.targetSeniority).toBeDefined();
      expect(result.preferences.targetSeniority!.length).toBeGreaterThan(0);
    });

    it('infers seniority based on years of experience', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({
          experience: [
            { title: 'Developer', company: 'Co', startDate: '2024-06-01', endDate: '2026-01-01' },
          ],
        }),
      );
      expect(result.preferences.targetSeniority).toBeDefined();
      expect(result.preferences.targetSeniority!.length).toBeGreaterThan(0);
    });

    it('extracts skills (up to 20)', async () => {
      const manySkills = Array.from({ length: 25 }, (_, i) => `Skill${i}`);
      const result = await buildPreferencesFromProfile(makeProfile({ skills: manySkills }));
      expect(result.preferences.skills!.length).toBeLessThanOrEqual(20);
    });

    it('generates suggestion strings', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.suggestions.length).toBeGreaterThan(0);
      for (const s of result.suggestions) {
        expect(typeof s).toBe('string');
      }
    });

    it('confidence is between 0 and 1', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('defaults remotePreference to ANY', async () => {
      const result = await buildPreferencesFromProfile(makeProfile());
      expect(result.preferences.remotePreference).toBe('ANY');
    });

    it('handles profile with no experience gracefully', async () => {
      const result = await buildPreferencesFromProfile(
        makeProfile({ experience: [], targetRoles: ['Software Engineer'] }),
      );
      expect(result.preferences.targetRoles).toContain('Software Engineer');
    });
  });
});
