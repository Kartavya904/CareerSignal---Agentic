import { describe, it, expect } from 'vitest';
import {
  estimateTotalYearsFromWork,
  estimateTotalMonthsFromWork,
  inferSeniority,
} from '@careersignal/agents';

describe('profile-insights-agent (code-only functions)', () => {
  describe('estimateTotalMonthsFromWork', () => {
    it('returns 0 for empty experience', () => {
      expect(estimateTotalMonthsFromWork([])).toBe(0);
    });

    it('calculates months from start_date to end_date', () => {
      const exp = [{ title: 'Dev', start_date: 'Jan 2020', end_date: 'Jan 2022' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeGreaterThanOrEqual(24);
      expect(months).toBeLessThanOrEqual(26);
    });

    it('handles "Present" as end date', () => {
      const exp = [{ title: 'Dev', start_date: 'Jan 2024', end_date: 'Present' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeGreaterThan(0);
    });

    it('handles "Current" as end date', () => {
      const exp = [{ title: 'Dev', start_date: 'Jan 2024', end_date: 'Current' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeGreaterThan(0);
    });

    it('handles ISO date format (YYYY-MM)', () => {
      const exp = [{ title: 'Dev', startDate: '2020-01', endDate: '2022-01' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeGreaterThanOrEqual(24);
    });

    it('sums multiple experiences', () => {
      const exp = [
        { title: 'Dev', start_date: 'Jan 2020', end_date: 'Jan 2021' },
        { title: 'Senior Dev', start_date: 'Feb 2021', end_date: 'Feb 2023' },
      ];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeGreaterThanOrEqual(36);
    });

    it('caps at 40 years', () => {
      const exp = [{ title: 'Dev', start_date: 'Jan 1950', end_date: 'Jan 2025' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeLessThanOrEqual(40 * 12);
    });

    it('skips entries with invalid dates', () => {
      const exp = [{ title: 'Dev', start_date: 'unknown', end_date: 'also unknown' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBeGreaterThanOrEqual(0);
    });

    it('falls back to entry count * 12 when dates are unparseable', () => {
      const exp = [{ title: 'Dev 1' }, { title: 'Dev 2' }];
      const months = estimateTotalMonthsFromWork(exp);
      expect(months).toBe(24);
    });
  });

  describe('estimateTotalYearsFromWork', () => {
    it('returns 0 for empty experience', () => {
      expect(estimateTotalYearsFromWork([])).toBe(0);
    });

    it('rounds months to years', () => {
      const exp = [{ title: 'Dev', start_date: 'Jan 2020', end_date: 'Jul 2023' }];
      const years = estimateTotalYearsFromWork(exp);
      expect(years).toBeGreaterThanOrEqual(3);
      expect(years).toBeLessThanOrEqual(4);
    });
  });

  describe('inferSeniority', () => {
    it('returns Entry for < 24 months', () => {
      expect(inferSeniority(12, [])).toBe('Entry');
      expect(inferSeniority(23, [])).toBe('Entry');
    });

    it('returns Entry for 0 months', () => {
      expect(inferSeniority(0, [])).toBe('Entry');
    });

    it('returns Junior for 24-35 months without title override', () => {
      const exp = [{ title: 'Software Developer' }];
      const result = inferSeniority(30, exp);
      expect(['Junior', 'Mid']).toContain(result);
    });

    it('returns Mid for 36-95 months', () => {
      const exp = [{ title: 'Software Developer' }];
      const result = inferSeniority(60, exp);
      expect(result).toBe('Mid');
    });

    it('returns Senior for 96+ months', () => {
      const exp = [{ title: 'Software Developer' }];
      const result = inferSeniority(120, exp);
      expect(result).toBe('Senior');
    });

    it('returns Senior+ for 15+ years', () => {
      const exp = [{ title: 'Software Developer' }];
      const result = inferSeniority(15 * 12, exp);
      expect(result).toBe('Senior+');
    });

    it('title override: "senior" in title promotes to Senior', () => {
      const exp = [{ title: 'Senior Software Engineer' }];
      const result = inferSeniority(48, exp);
      expect(result).toBe('Senior');
    });

    it('title override: "director" promotes to Senior+', () => {
      const exp = [{ title: 'Director of Engineering' }];
      const result = inferSeniority(120, exp);
      expect(result).toBe('Senior+');
    });

    it('title override: "vp" promotes to Senior+', () => {
      const exp = [{ title: 'VP Engineering' }];
      const result = inferSeniority(120, exp);
      expect(result).toBe('Senior+');
    });

    it('always returns Entry for < 24 months regardless of title', () => {
      const exp = [{ title: 'Senior Director VP Principal' }];
      expect(inferSeniority(20, exp)).toBe('Entry');
    });

    it('handles empty experience array', () => {
      expect(inferSeniority(60, [])).toBe('Mid');
    });
  });
});
