import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  normalizeGreenhouseJobExport,
  fetchGreenhouseBoardExport,
  greenhouseConnector,
  computeDedupeKey,
} from '@careersignal/core';

describe('Greenhouse connector', () => {
  describe('normalization', () => {
    it('produces correct canonical fields from raw job', () => {
      const raw = {
        id: 127817,
        title: 'Vault Designer',
        absolute_url: 'https://boards.greenhouse.io/vaulttec/jobs/127817',
        location: { name: 'NYC' },
        updated_at: '2016-01-14T10:55:28-05:00',
        content: '<p>Desc</p>',
        departments: [{ name: 'Engineering' }],
        offices: [{ name: 'NYC', location: 'New York' }],
      };
      const job = normalizeGreenhouseJobExport(raw);
      expect(job.title).toBe('Vault Designer');
      expect(job.location).toBe('NYC');
      expect(job.applyUrl).toBe('https://boards.greenhouse.io/vaulttec/jobs/127817');
      expect(job.jobUrl).toBe(job.applyUrl);
      expect(job.externalId).toBe('127817');
      expect(job.level).toBe('Engineering');
      expect(job.status).toBe('OPEN');
      expect(job.dedupeKey).toBe(
        computeDedupeKey({ applyUrl: raw.absolute_url, sourcePrefix: 'gh' }),
      );
      expect(job.descriptionText).toContain('Desc');
      expect(job.postedAt).toBeInstanceOf(Date);
      expect((job.postedAt as Date).getFullYear()).toBe(2016);
    });

    it('dedupe_key is stable for same absolute_url', () => {
      const url = 'https://boards.greenhouse.io/acme/jobs/123';
      const key1 = computeDedupeKey({ applyUrl: url, sourcePrefix: 'gh' });
      const key2 = computeDedupeKey({ applyUrl: url + '/', sourcePrefix: 'gh' });
      expect(key1).toBe(key2);
    });

    it('uses fallback external_id prefix when no URL', () => {
      const raw = {
        id: 999,
        title: 'No URL Job',
        location: { name: 'Remote' },
      };
      const job = normalizeGreenhouseJobExport(
        raw as Parameters<typeof normalizeGreenhouseJobExport>[0],
      );
      expect(job.dedupeKey).toMatch(/^gh:999$/);
    });
  });

  describe('fixture', () => {
    it('normalizes fixture jobs and dedupe_key is stable', async () => {
      const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'greenhouse-response.json');
      const json = await readFile(fixturePath, 'utf-8');
      const data = JSON.parse(json);
      expect(data.jobs).toHaveLength(2);
      const job1 = normalizeGreenhouseJobExport(data.jobs[0]);
      const job2 = normalizeGreenhouseJobExport(data.jobs[1]);
      expect(job1.dedupeKey).toBe(
        computeDedupeKey({
          applyUrl: 'https://boards.greenhouse.io/vaulttec/jobs/127817',
          sourcePrefix: 'gh',
        }),
      );
      expect(job2.dedupeKey).toBe(
        computeDedupeKey({
          applyUrl: 'https://boards.greenhouse.io/vaulttec/jobs/127818',
          sourcePrefix: 'gh',
        }),
      );
      expect(job1.title).toBe('Vault Designer');
      expect(job2.title).toBe('Security Analyst');
    });
  });

  describe('connector.fetch', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('returns error when boardToken is missing', async () => {
      const result = await greenhouseConnector.fetch({});
      expect(result.jobs).toHaveLength(0);
      expect(result.errors).toContain('Missing boardToken in connector config');
      expect(result.evidencePath).toBe('');
    });

    it('writes evidence when evidenceDir is provided and fetch succeeds', async () => {
      const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'greenhouse-response.json');
      const fixture = JSON.parse(await readFile(fixturePath, 'utf-8'));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fixture),
        }),
      );

      const evidenceDir = join(process.cwd(), 'data', 'evidence', 'greenhouse');
      const result = await greenhouseConnector.fetch(
        { boardToken: 'vaulttec', evidenceDir },
        undefined,
      );

      expect(result.jobs).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.evidencePath).toContain('vaulttec');
      expect(result.evidencePath.endsWith('.json')).toBe(true);
    });
  });
});
