/**
 * RAG pipeline for job pages: chunk raw/cleaned HTML, embed with local model,
 * score chunks by job-content relevance, and produce focused content for extraction.
 * All artifacts (chunks.json, embeddings.json, focused_content.html) go in the run folder.
 */

import { parse, type HTMLElement } from 'node-html-parser';
import { embedBatch, complete } from '@careersignal/llm';
import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getRunFolderPath, updateContentHashes } from '@/lib/application-assistant-disk';

export interface ChunkRecord {
  id: string;
  text: string;
  index: number;
  tag?: string;
}

export interface ChunkWithScore extends ChunkRecord {
  score: number;
  keep: boolean;
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'td',
  'th',
  'span', // many sites use span for job text
]);

const MIN_CHUNK_CHARS = 15;
const MAX_CHUNK_CHARS = 2000;

/** Job-content query used to score chunks (embedded once per run). */
const JOB_QUERY =
  'job title company name location job description responsibilities requirements qualifications salary compensation benefits apply how to apply';

/**
 * Chunk HTML into text blocks with id and index. Prefers block-level elements with meaningful text.
 */
export function chunkHtml(html: string): ChunkRecord[] {
  const root = parse(html, { comment: false });
  const chunks: ChunkRecord[] = [];
  let index = 0;

  function getText(el: HTMLElement): string {
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function walk(node: HTMLElement): void {
    if (!node.childNodes) return;

    const tag = (node.tagName ?? '').toLowerCase();
    if (BLOCK_TAGS.has(tag)) {
      const text = getText(node);
      if (text.length >= MIN_CHUNK_CHARS && text.length <= MAX_CHUNK_CHARS) {
        chunks.push({ id: `c${index}`, text, index, tag });
        index++;
        return; // don't recurse into children we just consumed
      }
      if (text.length > MAX_CHUNK_CHARS) {
        // Split by sentences or fixed size for very long blocks
        const parts = text.match(/[^.!?]+[.!?]+\s*|.+$/g) ?? [text];
        let offset = 0;
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.length >= MIN_CHUNK_CHARS) {
            chunks.push({ id: `c${index}`, text: trimmed, index, tag });
            index++;
            offset += trimmed.length;
          }
        }
        if (offset === 0) {
          chunks.push({
            id: `c${index}`,
            text: text.slice(0, MAX_CHUNK_CHARS),
            index,
            tag,
          });
          index++;
        }
        return;
      }
    }

    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      walk(child as HTMLElement);
    }
  }

  const body = root.querySelector('body') ?? root;
  walk(body as HTMLElement);

  if (chunks.length === 0) {
    const fullText = getText(root as HTMLElement);
    if (fullText.length >= MIN_CHUNK_CHARS) {
      chunks.push({
        id: 'c0',
        text: fullText.slice(0, MAX_CHUNK_CHARS * 3),
        index: 0,
      });
    }
  }

  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Heuristic boost for chunks that contain job-related phrases. */
function keywordBoost(text: string): number {
  const lower = text.toLowerCase();
  let boost = 0;
  const terms = [
    'responsibilities',
    'requirements',
    'qualifications',
    'experience',
    'salary',
    'compensation',
    'benefits',
    'apply',
    'location',
    'remote',
    'hybrid',
    'full-time',
    'part-time',
    'job description',
    'about the role',
    'about us',
    'company',
    'team',
  ];
  for (const t of terms) {
    if (lower.includes(t)) boost += 0.05;
  }
  return Math.min(boost, 0.4);
}

/**
 * Score chunks by similarity to job query embedding + keyword boost. Mark keep for top scores.
 */
export function scoreChunks(
  chunks: ChunkRecord[],
  embeddings: number[][],
  queryEmbedding: number[],
  options?: { topK?: number; minScore?: number },
): ChunkWithScore[] {
  const topK = options?.topK ?? 20;
  const minScore = options?.minScore ?? 0.2;
  const withScores: ChunkWithScore[] = chunks.map((c, i) => {
    const emb = embeddings[i] ?? [];
    const sim = cosineSimilarity(emb, queryEmbedding);
    const boost = keywordBoost(c.text);
    const score = sim + boost;
    return { ...c, score, keep: false };
  });
  withScores.sort((a, b) => b.score - a.score);
  let kept = 0;
  for (const c of withScores) {
    if (kept < topK && c.score >= minScore) {
      c.keep = true;
      kept++;
    }
  }
  // Restore original document order for kept chunks
  withScores.sort((a, b) => a.index - b.index);
  return withScores;
}

type ChunkLabel =
  | 'JOB_TITLE'
  | 'COMPANY_NAME'
  | 'LOCATION_LINE'
  | 'ABOUT_JOB_OR_TEAM'
  | 'RESPONSIBILITIES'
  | 'REQUIREMENTS'
  | 'BENEFITS_OR_COMPENSATION'
  | 'APPLICATION_INSTRUCTIONS'
  | 'GENERAL_JOB_TEXT'
  | 'NAV_OR_FOOTER'
  | 'UNRELATED';

interface ChunkMemory {
  hasTitle: boolean;
  hasCompany: boolean;
  hasLocation: boolean;
  hasAboutTeam: boolean;
  hasResponsibilities: boolean;
  hasRequirements: boolean;
}

interface LlmRankResult {
  importanceScore: number;
  label: ChunkLabel;
  continuationOfImportant: boolean;
  memory?: Partial<ChunkMemory>;
}

const IMPORTANT_LABELS: ChunkLabel[] = [
  'JOB_TITLE',
  'COMPANY_NAME',
  'LOCATION_LINE',
  'ABOUT_JOB_OR_TEAM',
  'RESPONSIBILITIES',
  'REQUIREMENTS',
  'BENEFITS_OR_COMPENSATION',
  'APPLICATION_INSTRUCTIONS',
  'GENERAL_JOB_TEXT',
];

/**
 * Build focused HTML from kept chunks (in document order) for the extractor.
 */
export function buildFocusedContent(chunksWithScores: ChunkWithScore[]): string {
  const kept = chunksWithScores.filter((c) => c.keep);
  const parts = kept.map((c) => `<div data-chunk-id="${c.id}">${escapeHtml(c.text)}</div>`);
  return `<html><head><meta charset="utf-8"></head><body>${parts.join('\n')}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RagPipelineResult {
  focusedHtml: string | null;
  chunksCount: number;
  keptCount: number;
  error?: string;
}

function mergeMemory(prev: ChunkMemory, next?: Partial<ChunkMemory>): ChunkMemory {
  if (!next) return prev;
  return {
    hasTitle: next.hasTitle ?? prev.hasTitle,
    hasCompany: next.hasCompany ?? prev.hasCompany,
    hasLocation: next.hasLocation ?? prev.hasLocation,
    hasAboutTeam: next.hasAboutTeam ?? prev.hasAboutTeam,
    hasResponsibilities: next.hasResponsibilities ?? prev.hasResponsibilities,
    hasRequirements: next.hasRequirements ?? prev.hasRequirements,
  };
}

/**
 * Use FAST LLM to rank a subset of chunks with a tiny JSON memory that carries forward
 * what has already been captured (title, company, location, responsibilities, etc.).
 * Returns ChunkWithScore where score is the LLM importanceScore plus small boosts.
 */
export async function rankChunksWithLlm(
  chunks: ChunkRecord[],
  onLog?: (message: string) => void,
): Promise<ChunkWithScore[]> {
  if (chunks.length === 0) return [];

  onLog?.(`RAG: LLM ranking ${chunks.length} candidate chunks (FAST model)...`);

  let memory: ChunkMemory = {
    hasTitle: false,
    hasCompany: false,
    hasLocation: false,
    hasAboutTeam: false,
    hasResponsibilities: false,
    hasRequirements: false,
  };

  const results: ChunkWithScore[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const prev = i > 0 ? chunks[i - 1]!.text.slice(0, 400) : '';
    const memJson = JSON.stringify(memory);

    const prompt = `You are ranking chunks from a single job posting page.

You see one chunk at a time, in document order, plus:
- A short memory of what important pieces have ALREADY been seen (job title, company name, location, responsibilities, requirements, etc.).
- The previous chunk text (to detect if this chunk is a continuation).

Your job for EACH chunk:
1. Decide how IMPORTANT this chunk is for understanding the job posting.
2. Classify it into one of these labels (pick the closest):
   - JOB_TITLE
   - COMPANY_NAME
   - LOCATION_LINE
   - ABOUT_JOB_OR_TEAM
   - RESPONSIBILITIES
   - REQUIREMENTS
   - BENEFITS_OR_COMPENSATION
   - APPLICATION_INSTRUCTIONS
   - GENERAL_JOB_TEXT
   - NAV_OR_FOOTER
   - UNRELATED
3. Decide if this chunk is a CONTINUATION of an important previous chunk (e.g., the rest of the title/paragraph/section).
4. Update the memory flags if this chunk clearly contains one of the core fields.

IMPORTANT:
- Navigation bars, global footers, legal boilerplate, and generic site menus should be NAV_OR_FOOTER or UNRELATED.
- The main job title line (and its continuation) MUST be marked JOB_TITLE and treated as very important.
- \"About the role/team/job\" intro paragraphs are ABOUT_JOB_OR_TEAM and important.
- Responsibilities and Requirements sections are important even if they are bullet lists.

Return ONLY a single JSON object with this shape:
{
  "importanceScore": number between 0 and 1,
  "label": "one of the labels above",
  "continuationOfImportant": boolean,
  "memory": {
    "hasTitle": boolean,
    "hasCompany": boolean,
    "hasLocation": boolean,
    "hasAboutTeam": boolean,
    "hasResponsibilities": boolean,
    "hasRequirements": boolean
  }
}

Current memory (what has been captured so far):
${memJson}

Previous chunk text (may be empty):
${prev || '(none)'}

Current chunk text:
${chunk.text.slice(0, 800)}`;

    let parsed: LlmRankResult = {
      importanceScore: 0.3,
      label: 'GENERAL_JOB_TEXT',
      continuationOfImportant: false,
    };

    try {
      const response = await complete(prompt, 'FAST', {
        format: 'json',
        temperature: 0.1,
        maxTokens: 512,
        timeout: 120000,
      });
      const json = JSON.parse(response) as Partial<LlmRankResult>;
      parsed = {
        importanceScore:
          typeof json.importanceScore === 'number'
            ? Math.max(0, Math.min(1, json.importanceScore))
            : 0.3,
        label: IMPORTANT_LABELS.includes(json.label as ChunkLabel)
          ? (json.label as ChunkLabel)
          : json.label === 'NAV_OR_FOOTER' || json.label === 'UNRELATED'
            ? (json.label as ChunkLabel)
            : 'GENERAL_JOB_TEXT',
        continuationOfImportant: !!json.continuationOfImportant,
        memory: json.memory,
      };
    } catch {
      // Fall back to generic job text with medium importance
      parsed = {
        importanceScore: 0.3,
        label: 'GENERAL_JOB_TEXT',
        continuationOfImportant: false,
      };
    }

    memory = mergeMemory(memory, parsed.memory);

    let score = parsed.importanceScore;
    if (parsed.label === 'JOB_TITLE' || parsed.label === 'COMPANY_NAME') score += 0.5;
    if (parsed.label === 'LOCATION_LINE' || parsed.label === 'ABOUT_JOB_OR_TEAM') score += 0.3;
    if (parsed.label === 'RESPONSIBILITIES' || parsed.label === 'REQUIREMENTS') score += 0.2;
    if (parsed.label === 'BENEFITS_OR_COMPENSATION' || parsed.label === 'APPLICATION_INSTRUCTIONS')
      score += 0.15;
    if (parsed.label === 'NAV_OR_FOOTER' || parsed.label === 'UNRELATED') score -= 0.4;
    if (parsed.continuationOfImportant) score += 0.15;

    results.push({
      ...chunk,
      score,
      keep: false, // will be decided after we score all chunks
    });
  }

  // Decide keep flags:
  // 1) Hard-keep important labels and continuations
  for (const r of results) {
    if (
      r.score >= 0.5 &&
      r.tag !== 'nav' &&
      r.tag !== 'footer' &&
      r.tag !== 'header' &&
      r.tag !== 'aside'
    ) {
      r.keep = true;
    }
  }

  // 2) Ensure at least one title-like line is kept
  const hasTitleKept = results.some(
    (r) => r.keep && r.text.toLowerCase().includes('engineer') && r.text.length < 200,
  );
  if (!hasTitleKept) {
    const bestTitleCandidate = results
      .filter(
        (r) => r.text.toLowerCase().includes('engineer') || r.text.toLowerCase().includes('intern'),
      )
      .sort((a, b) => b.score - a.score)[0];
    if (bestTitleCandidate) bestTitleCandidate.keep = true;
  }

  // 3) Soft-keep by score up to a budget
  const budget = 30;
  const sortedByScore = [...results].sort((a, b) => b.score - a.score);
  let kept = results.filter((r) => r.keep).length;
  for (const r of sortedByScore) {
    if (kept >= budget) break;
    if (!r.keep && r.score >= 0.3) {
      r.keep = true;
      kept++;
    }
  }

  // Restore document order
  results.sort((a, b) => a.index - b.index);
  onLog?.(
    `RAG: LLM kept ${results.filter((r) => r.keep).length}/${results.length} candidate chunks.`,
  );
  return results;
}

/**
 * Run full RAG pipeline: chunk -> embed -> score -> focused content. Writes chunks.json,
 * embeddings.json, chunk_scores.json, and focused_content.html into the run folder.
 * Returns focused HTML for extraction, or null on failure (caller should fall back to full HTML).
 */
export async function runRagPipeline(
  folderName: string,
  html: string,
  onLog?: (message: string) => void,
): Promise<RagPipelineResult> {
  const dir = getRunFolderPath(folderName);
  if (!existsSync(dir)) {
    return { focusedHtml: null, chunksCount: 0, keptCount: 0, error: 'Run folder not found' };
  }

  try {
    onLog?.('RAG: Chunking HTML...');
    const chunks = chunkHtml(html);
    if (chunks.length === 0) {
      onLog?.('RAG: No chunks produced, skipping.');
      return { focusedHtml: null, chunksCount: 0, keptCount: 0 };
    }

    await writeFile(path.join(dir, 'chunks.json'), JSON.stringify(chunks, null, 2), 'utf-8');
    onLog?.(`RAG: ${chunks.length} chunks saved.`);
    await updateContentHashes(folderName, ['chunks.json']);

    onLog?.('RAG: Embedding chunks (local model)...');
    const embeddings = await embedBatch(
      chunks.map((c) => c.text),
      {
        batchSize: 8,
        timeout: 120000,
      },
    );
    if (embeddings.length !== chunks.length) {
      onLog?.(`RAG: Embedding count mismatch ${embeddings.length} vs ${chunks.length}, skipping.`);
      return {
        focusedHtml: null,
        chunksCount: chunks.length,
        keptCount: 0,
        error: 'Embedding mismatch',
      };
    }

    await writeFile(
      path.join(dir, 'embeddings.json'),
      JSON.stringify(
        embeddings.map((e, i) => ({ id: chunks[i]!.id, embedding: e })),
        null,
        2,
      ),
      'utf-8',
    );
    await updateContentHashes(folderName, ['embeddings.json']);

    // Embedding-based scores are used as a cheap pre-filter for the LLM ranker.
    onLog?.('RAG: Scoring chunks with embeddings (pre-filter)...');
    const queryEmbedding = (await embedBatch([JOB_QUERY], { timeout: 30000 }))[0];
    let keptCount = 0;
    let withScores = scoreChunks(chunks, embeddings, queryEmbedding ?? [], {
      topK: 40,
      minScore: 0.0,
    });
    // Take top-N by score as candidates for LLM ranking
    const sortedByScore = [...withScores].sort((a, b) => b.score - a.score);
    const candidateIds = new Set(sortedByScore.slice(0, 40).map((c) => c.id));
    const candidateChunks = chunks.filter((c) => candidateIds.has(c.id));

    const llmRanked = await rankChunksWithLlm(candidateChunks, onLog);
    const llmKeepIds = new Set(llmRanked.filter((c) => c.keep).map((c) => c.id));

    // Merge: mark keep when LLM says so; keep scores from LLM where available
    const llmScoreById = new Map(llmRanked.map((c) => [c.id, c.score]));
    withScores = withScores.map((c) => {
      const llmScore = llmScoreById.get(c.id);
      const keep = llmKeepIds.has(c.id);
      return {
        ...c,
        score: typeof llmScore === 'number' ? llmScore : c.score,
        keep,
      };
    });
    keptCount = withScores.filter((c) => c.keep).length;

    await writeFile(
      path.join(dir, 'chunk_scores.json'),
      JSON.stringify(
        withScores.map(({ id, index, score, keep, text }) => ({
          id,
          index,
          score,
          keep,
          textPreview: text.slice(0, 120),
        })),
        null,
        2,
      ),
      'utf-8',
    );
    onLog?.(`RAG: Kept ${keptCount}/${chunks.length} chunks.`);

    const focusedHtml = buildFocusedContent(withScores);
    await writeFile(path.join(dir, 'focused_content.html'), focusedHtml, 'utf-8');
    onLog?.('RAG: Focused content saved.');
    await updateContentHashes(folderName, ['chunk_scores.json', 'focused_content.html']);

    return { focusedHtml, chunksCount: chunks.length, keptCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isModelNotFound =
      msg.includes('not found') ||
      msg.includes('404') ||
      (err instanceof Error && 'status' in err && (err as { status?: number }).status === 404);
    if (isModelNotFound) {
      const embedModel = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
      onLog?.(`RAG error: ${msg}`);
      onLog?.(
        `RAG: Install an embedding model with: ollama pull ${embedModel} (or set OLLAMA_EMBED_MODEL to a model you have). Extraction will use full page.`,
      );
    } else {
      onLog?.(`RAG error: ${msg}`);
    }
    onLog?.('RAG: Skipping RAG; extraction will use full page.');
    return {
      focusedHtml: null,
      chunksCount: 0,
      keptCount: 0,
      error: msg,
    };
  }
}
