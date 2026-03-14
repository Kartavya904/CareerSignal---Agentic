/**
 * Login wall human-in-the-loop state.
 * When scraping detects a login wall, we open a visible browser and wait
 * for the admin to log in manually, then re-capture HTML and continue.
 *
 * Same pattern as captcha-state.ts.
 */

import type { Page } from 'playwright';

type LoginResolver = (html: string) => void;
type LoginRejector = (err: Error) => void;

const LOGIN_TIMEOUT_MS = 120_000; // 2 minutes

let waitingForLogin = false;
let loginPage: Page | null = null;
let loginResolve: LoginResolver | null = null;
let loginReject: LoginRejector | null = null;
let loginTimeout: ReturnType<typeof setTimeout> | null = null;

export function isWaitingForLoginSolve(): boolean {
  return waitingForLogin;
}

export function registerLoginWait(page: Page): Promise<string> {
  // Clear any existing timeout just in case
  if (loginTimeout) clearTimeout(loginTimeout);
  
  waitingForLogin = true;
  loginPage = page;
  
  return new Promise<string>((resolve, reject) => {
    loginResolve = resolve;
    loginReject = reject;
    
    loginTimeout = setTimeout(() => {
      cancelLoginWait(new Error('Login wall timeout (120s) — browser automated fallback requested'));
    }, LOGIN_TIMEOUT_MS);
  });
}

export async function signalLoggedIn(): Promise<string> {
  if (!waitingForLogin || !loginPage || !loginResolve) {
    throw new Error('No login solve in progress');
  }
  if (loginTimeout) {
    clearTimeout(loginTimeout);
    loginTimeout = null;
  }
  try {
    const html = await loginPage.content();
    loginResolve(html);
    return html;
  } finally {
    waitingForLogin = false;
    loginPage = null;
    loginResolve = null;
    loginReject = null;
  }
}

export function cancelLoginWait(err?: Error): void {
  if (loginTimeout) {
    clearTimeout(loginTimeout);
    loginTimeout = null;
  }
  if (loginReject) {
    loginReject(err ?? new Error('Login wait cancelled'));
  }
  waitingForLogin = false;
  loginPage = null;
  loginResolve = null;
  loginReject = null;
}
