/**
 * HTML Cleanup Agent — Deterministic, minimal output for extraction.
 *
 * Goal: Strip all non-essential markup so cleaned HTML is minimal while
 * preserving every piece of information needed for job extraction and
 * link discovery: all <a href>, canonical/og:url, title/description,
 * and text content (job titles, company names, locations, etc.).
 *
 * Removes: scripts, styles, SVGs, images, buttons, form inputs, most meta/link
 * tags, class/style/role/aria attributes, HTML comments. Keeps only structure
 * and content that carries meaning.
 */

import { parse, type HTMLElement } from 'node-html-parser';

export interface CleanupResult {
  html: string;
  originalSize: number;
  cleanedSize: number;
  elementsRemoved: number;
}

// Tags to remove entirely (no content needed for extraction)
const REMOVE_TAGS = new Set([
  'script',
  'noscript',
  'iframe',
  'object',
  'embed',
  'applet',
  'svg',
  'style',
  'img',
  'button',
  'input',
  'textarea',
  'select',
  'form',
  'picture',
  'source',
  'video',
  'audio',
  'canvas',
]);

// Link rel values we KEEP (only canonical and alternate carry URL meaning)
const KEEP_LINK_REL = new Set(['canonical', 'alternate']);

// Meta name/property we KEEP in head (title is separate tag)
const KEEP_META = new Set(['description', 'og:url', 'og:title', 'og:description']);

/**
 * Clean raw HTML to a minimal document: links, key meta, and text structure only.
 */
export function cleanHtml(rawHtml: string, _sourceUrl?: string): CleanupResult {
  const originalSize = rawHtml.length;
  let elementsRemoved = 0;

  const root = parse(rawHtml, {
    comment: false,
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
    },
  });

  const toRemove: HTMLElement[] = [];

  function walk(node: HTMLElement): void {
    if (!node.childNodes) return;

    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      const el = child as HTMLElement;
      const tag = (el.tagName ?? '').toLowerCase();

      if (REMOVE_TAGS.has(tag)) {
        toRemove.push(el);
        continue;
      }

      if (tag === 'link') {
        const rel = (el.getAttribute('rel') ?? '').toLowerCase().trim();
        if (!KEEP_LINK_REL.has(rel)) {
          toRemove.push(el);
          continue;
        }
      }

      // meta handled in head pass below

      stripNoiseAttributes(el);
      walk(el);
    }
  }

  walk(root);

  for (const el of toRemove) {
    el.remove();
    elementsRemoved++;
  }

  // Second pass: simplify head — keep only charset, description, og:url/title/description
  const head = root.querySelector('head');
  if (head) {
    for (const meta of head.querySelectorAll('meta')) {
      const charset = meta.getAttribute('charset');
      const name = (meta.getAttribute('name') ?? '').toLowerCase();
      const prop = (meta.getAttribute('property') ?? '').toLowerCase();
      const keep =
        !!charset ||
        name === 'description' ||
        prop === 'og:url' ||
        prop === 'og:title' ||
        prop === 'og:description';
      if (!keep) {
        meta.remove();
        elementsRemoved++;
      }
    }
    for (const link of head.querySelectorAll('link')) {
      const rel = (link.getAttribute('rel') ?? '').toLowerCase().trim();
      if (!KEEP_LINK_REL.has(rel)) {
        link.remove();
        elementsRemoved++;
      }
    }
  }

  let cleaned = root.toString();

  // Strip HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Nuke ALL CSS: class and style attributes (node-html-parser's removeAttribute
  // is unreliable, so we strip via regex on the serialized output)
  cleaned = cleaned.replace(/\s+class="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+class='[^']*'/gi, '');
  cleaned = cleaned.replace(/\s+style="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+style='[^']*'/gi, '');

  // Remove any <style> blocks that survived the tree walk (e.g. nested or dynamic)
  cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Strip remaining noise attributes the tree walk may have missed
  cleaned = cleaned.replace(/\s+data-[\w-]+="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+aria-[\w-]+="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+role="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+tabindex="[^"]*"/gi, '');

  // Collapse whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[^\S\n]{2,}/g, ' ');
  cleaned = cleaned.replace(/[ \t]+$/gm, '');

  return {
    html: cleaned,
    originalSize,
    cleanedSize: cleaned.length,
    elementsRemoved,
  };
}

/** Strip attributes that add no value for extraction: class, style, data-*, event handlers, role, aria-*, etc. */
function stripNoiseAttributes(el: HTMLElement): void {
  const attrs = el.attributes;
  const toDelete: string[] = [];

  for (const key of Object.keys(attrs)) {
    const k = key.toLowerCase();
    if (
      k === 'style' ||
      k === 'class' ||
      k.startsWith('data-') ||
      k.startsWith('on') ||
      k.startsWith('aria-') ||
      k === 'role' ||
      k === 'tabindex' ||
      k === 'loading' ||
      k === 'decoding' ||
      k === 'fetchpriority' ||
      k === 'draggable' ||
      k === 'hidden' ||
      k === 'contenteditable' ||
      k === 'spellcheck' ||
      k === 'autocapitalize' ||
      k === 'autocomplete' ||
      k === 'autocorrect'
    ) {
      toDelete.push(key);
    }
  }

  for (const key of toDelete) {
    el.removeAttribute(key);
  }
}
