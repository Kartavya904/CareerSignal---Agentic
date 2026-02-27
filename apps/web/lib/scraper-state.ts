/**
 * Stub: Admin scraper was removed with scope pivot (Application Assistant only).
 * Application Assistant checks this to avoid running while "admin scraper" is active;
 * since there is no admin scraper anymore, we always report not running.
 */

export function getScraperStatus(): {
  running: boolean;
  stopRequested: boolean;
  visibleMode: boolean;
} {
  return { running: false, stopRequested: false, visibleMode: false };
}
