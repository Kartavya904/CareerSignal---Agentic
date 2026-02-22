/**
 * Browser Navigator Agent - Playwright driver for web navigation
 *
 * Responsibilities:
 * - Navigate to URLs
 * - Wait for content to load
 * - Capture page artifacts (HTML, screenshots)
 *
 * LLM Usage: None (pure Playwright automation)
 */

import { chromium } from 'playwright';
import type { PageArtifact } from './types.js';

export interface NavigatorConfig {
  headless?: boolean;
  timeout?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface NavigationResult {
  success: boolean;
  artifact?: PageArtifact;
  error?: string;
}

const DEFAULT_CONFIG: NavigatorConfig = {
  headless: true,
  timeout: 30000,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
};

/**
 * Navigate to a URL and capture page HTML using Playwright
 */
export async function navigateToUrl(
  url: string,
  config: NavigatorConfig = DEFAULT_CONFIG,
): Promise<NavigationResult> {
  const browser = await chromium.launch({ headless: config.headless ?? true });
  try {
    const context = await browser.newContext({
      userAgent: config.userAgent ?? DEFAULT_CONFIG.userAgent,
      viewport: config.viewport ?? DEFAULT_CONFIG.viewport,
    });
    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    });

    // Wait for common job-related content to load (SPA)
    await new Promise((r) => setTimeout(r, 3000));

    const html = await page.content();
    const pageTitle = await page.title();

    await browser.close();

    const artifact: PageArtifact = {
      url,
      html,
      capturedAt: new Date().toISOString(),
      pageTitle: pageTitle || undefined,
    };

    return {
      success: true,
      artifact,
    };
  } catch (error) {
    await browser.close();
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: msg,
    };
  }
}
