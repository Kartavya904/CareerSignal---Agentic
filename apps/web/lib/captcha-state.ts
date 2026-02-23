/**
 * Captcha human-in-the-loop state.
 * When scraping detects a possible captcha, we open a visible browser and wait
 * for the admin to solve it, then capture HTML and continue.
 */

import type { Page } from 'playwright';

type CaptchaResolver = (html: string) => void;
type CaptchaRejector = (err: Error) => void;

let waitingForSolve = false;
let captchaPage: Page | null = null;
let captchaResolve: CaptchaResolver | null = null;
let captchaReject: CaptchaRejector | null = null;

export function isWaitingForCaptchaSolve(): boolean {
  return waitingForSolve;
}

export function registerCaptchaSolve(page: Page): Promise<string> {
  waitingForSolve = true;
  captchaPage = page;
  return new Promise<string>((resolve, reject) => {
    captchaResolve = resolve;
    captchaReject = reject;
  });
}

export async function signalCaptchaSolved(): Promise<string> {
  if (!waitingForSolve || !captchaPage || !captchaResolve) {
    throw new Error('No captcha solve in progress');
  }
  try {
    const html = await captchaPage.content();
    captchaResolve(html);
    return html;
  } finally {
    waitingForSolve = false;
    captchaPage = null;
    captchaResolve = null;
    captchaReject = null;
  }
}

export function cancelCaptchaSolve(err?: Error): void {
  if (captchaReject) {
    captchaReject(err ?? new Error('Captcha solve cancelled'));
  }
  waitingForSolve = false;
  captchaPage = null;
  captchaResolve = null;
  captchaReject = null;
}
