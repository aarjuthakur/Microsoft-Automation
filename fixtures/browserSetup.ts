import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { BROWSER_PROFILE_DIR } from '../config/forms.config';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

export async function launchPersistentEdge(): Promise<{ context: BrowserContext; page: Page }> {
  for (const lockFile of LOCK_FILES) {
    const lockPath = join(BROWSER_PROFILE_DIR, lockFile);
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath);
    } catch { /* lock file may not exist or be removable */ }
  }

  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    channel: 'msedge',
    headless: false,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}
