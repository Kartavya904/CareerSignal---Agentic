import { describe, it, expect } from 'vitest';
import { fingerprintFromUrl } from '@careersignal/core';

describe('fingerprintFromUrl', () => {
  describe('GREENHOUSE', () => {
    it('detects boards.greenhouse.io/BOARD and extracts boardToken', () => {
      const r = fingerprintFromUrl('https://boards.greenhouse.io/acme');
      expect(r.atsType).toBe('GREENHOUSE');
      expect(r.scrapeStrategy).toBe('API_JSON');
      expect(r.connectorConfig).toEqual({ boardToken: 'acme' });
    });

    it('detects subdomain company.greenhouse.io and uses host as boardToken', () => {
      const r = fingerprintFromUrl('https://acme.greenhouse.io');
      expect(r.atsType).toBe('GREENHOUSE');
      expect(r.connectorConfig).toEqual({ boardToken: 'acme' });
    });

    it('handles URL without protocol', () => {
      const r = fingerprintFromUrl('boards.greenhouse.io/stripe');
      expect(r.atsType).toBe('GREENHOUSE');
      expect(r.connectorConfig).toEqual({ boardToken: 'stripe' });
    });
  });

  describe('LEVER', () => {
    it('detects jobs.lever.co and extracts company slug from path', () => {
      const r = fingerprintFromUrl('https://jobs.lever.co/acme-corp');
      expect(r.atsType).toBe('LEVER');
      expect(r.scrapeStrategy).toBe('API_JSON');
      expect(r.connectorConfig).toEqual({ companySlug: 'acme-corp' });
    });

    it('handles jobs.lever.co with trailing slash', () => {
      const r = fingerprintFromUrl('https://jobs.lever.co/company/');
      expect(r.atsType).toBe('LEVER');
      expect(r.connectorConfig).toEqual({ companySlug: 'company' });
    });
  });

  describe('ASHBY', () => {
    it('detects jobs.ashbyhq.com and extracts company slug', () => {
      const r = fingerprintFromUrl('https://jobs.ashbyhq.com/example');
      expect(r.atsType).toBe('ASHBY');
      expect(r.scrapeStrategy).toBe('API_JSON');
      expect(r.connectorConfig).toEqual({ companySlug: 'example' });
    });

    it('detects *.ashbyhq.com subdomain', () => {
      const r = fingerprintFromUrl('https://careers.ashbyhq.com/acme');
      expect(r.atsType).toBe('ASHBY');
      expect(r.connectorConfig).toEqual({ companySlug: 'acme' });
    });
  });

  describe('SMARTRECRUITERS', () => {
    it('detects *.smartrecruiters.com', () => {
      const r = fingerprintFromUrl('https://jobs.smartrecruiters.com/acme');
      expect(r.atsType).toBe('SMARTRECRUITERS');
      expect(r.scrapeStrategy).toBe('API_JSON');
      expect(r.connectorConfig).toBeNull();
    });
  });

  describe('RECRUITEE', () => {
    it('detects *.recruitee.com', () => {
      const r = fingerprintFromUrl('https://acme.recruitee.com');
      expect(r.atsType).toBe('RECRUITEE');
      expect(r.scrapeStrategy).toBe('API_JSON');
      expect(r.connectorConfig).toBeNull();
    });
  });

  describe('PERSONIO', () => {
    it('detects *.jobs.personio.de', () => {
      const r = fingerprintFromUrl('https://acme.jobs.personio.de');
      expect(r.atsType).toBe('PERSONIO');
      expect(r.scrapeStrategy).toBe('API_JSON');
      expect(r.connectorConfig).toBeNull();
    });
  });

  describe('WORKDAY', () => {
    it('detects *.myworkdayjobs.com', () => {
      const r = fingerprintFromUrl('https://acme.myworkdayjobs.com/careers');
      expect(r.atsType).toBe('WORKDAY');
      expect(r.scrapeStrategy).toBe('API_XML');
      expect(r.connectorConfig).toBeNull();
    });

    it('detects *.wdN.myworkdayjobs.com', () => {
      const r = fingerprintFromUrl('https://acme.wd1.myworkdayjobs.com/en-US/careers');
      expect(r.atsType).toBe('WORKDAY');
    });
  });

  describe('UNKNOWN', () => {
    it('returns UNKNOWN for generic URLs', () => {
      const r = fingerprintFromUrl('https://example.com/careers');
      expect(r.atsType).toBe('UNKNOWN');
      expect(r.scrapeStrategy).toBe('AUTO');
      expect(r.connectorConfig).toBeNull();
    });

    it('returns UNKNOWN for invalid URL', () => {
      const r = fingerprintFromUrl('not-a-url');
      expect(r.atsType).toBe('UNKNOWN');
    });
  });
});
