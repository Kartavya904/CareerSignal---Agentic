/**
 * In-memory scraper state for continuous scrape loop.
 * Tracks whether the loop is running and whether Stop was requested.
 */

let scrapingActive = false;
let stopRequested = false;
let visibleMode = false;

export function getScraperStatus(): {
  running: boolean;
  stopRequested: boolean;
  visibleMode: boolean;
} {
  return { running: scrapingActive, stopRequested, visibleMode };
}

export function setVisibleMode(v: boolean): void {
  visibleMode = v;
}

export function requestScraperStop(): void {
  stopRequested = true;
}

export function setScraperActive(v: boolean): void {
  scrapingActive = v;
}

export function setStopRequested(v: boolean): void {
  stopRequested = v;
}
