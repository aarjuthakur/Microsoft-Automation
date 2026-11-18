import { test as base, type BrowserContext } from '@playwright/test';
import { FormEditorPage } from '../builder/FormEditorPage';
import { FormResponsePage } from '../tester/FormResponsePage';
import { launchPersistentEdge } from './browserSetup';
import { parseFormCsv } from '../csv/csvParser';
import { workflow } from '../utils/logger';
import type { FormTemplate } from '../models/types';

type FormFixtures = {
  persistentContext: BrowserContext;
  editorPage: FormEditorPage;
  responsePage: FormResponsePage;
  template: FormTemplate;
  steps: string[];
};

export const test = base.extend<FormFixtures>({
  persistentContext: async ({}, use) => {
    const { context } = await launchPersistentEdge();
    await use(context);
    await context.close();
  },

  editorPage: async ({ persistentContext }, use) => {
    const page = persistentContext.pages()[0] || await persistentContext.newPage();
    await use(new FormEditorPage(page));
  },

  responsePage: async ({ persistentContext }, use) => {
    const page = await persistentContext.newPage();
    await use(new FormResponsePage(page));
  },

  template: async ({}, use) => {
    const csvPath = process.env.CSV_FILE || 'samples/customer_feedback.csv';
    const template = parseFormCsv(csvPath);
    await use(template);
  },

  steps: async ({}, use, testInfo) => {
    const steps: string[] = [];
    await use(steps);
    if (steps.length > 0) {
      workflow(`${testInfo.title}`, steps);
    }
  },
});

export { expect } from '@playwright/test';
