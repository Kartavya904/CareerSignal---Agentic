import { describe, it, expect } from 'vitest';
import {
  chunkHtml,
  scoreChunks,
  buildFocusedContent,
  type ChunkRecord,
} from '@/lib/application-assistant-rag';

describe('RAG pipeline', () => {
  describe('chunkHtml', () => {
    it('returns chunks from job-like HTML', () => {
      const html = `
        <html><body>
          <nav>Home Careers</nav>
          <h1>Senior Software Engineer</h1>
          <p>We are looking for a talented engineer to join our team.</p>
          <section><h2>Responsibilities</h2><p>Build systems. Ship features.</p></section>
          <section><h2>Requirements</h2><p>5+ years experience. CS degree or equivalent.</p></section>
          <footer>© 2026 Company</footer>
        </body></html>
      `;
      const chunks = chunkHtml(html);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.every((c) => c.id.startsWith('c') && typeof c.index === 'number')).toBe(true);
      const texts = chunks.map((c) => c.text);
      expect(texts.some((t) => t.includes('Senior Software Engineer'))).toBe(true);
      expect(texts.some((t) => t.includes('Responsibilities') || t.includes('Requirements'))).toBe(
        true,
      );
    });

    it('returns at least one chunk when body has enough text', () => {
      const html = `<html><body><div><p>Job title: Engineer. Company: Acme. Location: NYC. Requirements: experience.</p></div></body></html>`;
      const chunks = chunkHtml(html);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]!.text.length).toBeGreaterThanOrEqual(15);
    });

    it('returns empty array for very short content', () => {
      const html = '<html><body><p>Hi</p></body></html>';
      const chunks = chunkHtml(html);
      expect(chunks).toEqual([]);
    });
  });

  describe('scoreChunks', () => {
    it('marks top-k chunks as keep by score', () => {
      const chunks: ChunkRecord[] = [
        { id: 'c0', text: 'Responsibilities and requirements for the role.', index: 0 },
        { id: 'c1', text: 'Footer links and legal.', index: 1 },
        { id: 'c2', text: 'Job description and company name and location.', index: 2 },
      ];
      const queryEmbedding = [0.5, 0.5, 0.5, 0.5];
      const embeddings: number[][] = [
        [0.8, 0.2, 0.2, 0.2],
        [0.1, 0.1, 0.1, 0.1],
        [0.7, 0.3, 0.3, 0.3],
      ];
      const withScores = scoreChunks(chunks, embeddings, queryEmbedding, {
        topK: 2,
        minScore: 0.1,
      });
      const kept = withScores.filter((c) => c.keep);
      expect(kept.length).toBeLessThanOrEqual(2);
      expect(withScores.map((c) => c.index)).toEqual([0, 1, 2]);
    });
  });

  describe('buildFocusedContent', () => {
    it('produces HTML with kept chunks in document order', () => {
      const withScores = [
        { id: 'c0', text: 'First block', index: 0, score: 0.9, keep: true },
        { id: 'c1', text: 'Second block', index: 1, score: 0.1, keep: false },
        { id: 'c2', text: 'Third block', index: 2, score: 0.8, keep: true },
      ];
      const html = buildFocusedContent(withScores);
      expect(html).toContain('First block');
      expect(html).toContain('Third block');
      expect(html).not.toContain('Second block');
      expect(html).toContain('<body>');
      expect(html).toContain('data-chunk-id="c0"');
      expect(html).toContain('data-chunk-id="c2"');
    });
  });
});
