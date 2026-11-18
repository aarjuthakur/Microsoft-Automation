import { type Page, type Locator } from '@playwright/test';
import {
  EDITOR, questionTypeButton, questionTypeButtonContains, questionTypeButtonText,
  questionTypeButtonContainsText,
} from './selectors';
import { FORMS_URL, TIMEOUTS, QUESTION_TYPE_BUTTONS } from '../config/forms.config';
import { BranchConfigurator } from './BranchConfigurator';
import type { FormField, FormTemplate } from '../models/types';

export class FormEditorPage {
  private isFirstQuestion = true;

  constructor(private page: Page) {}

  // -- Core interaction helpers (match Java's safeClickJs + scrollIntoView pattern) --

  private async scrollAndJsClick(locator: Locator): Promise<void> {
    await locator.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await this.sleep(300);
    await locator.evaluate(el => (el as HTMLElement).click());
  }

  private async jsClick(locator: Locator): Promise<void> {
    await locator.evaluate(el => (el as HTMLElement).click());
  }

  private async slowType(text: string): Promise<void> {
    const active = this.page.locator(':focus');
    await active.press('Control+a');
    await this.sleep(200);
    await active.press('Delete');
    await this.sleep(200);
    await active.pressSequentially(text, { delay: TIMEOUTS.slowTypeDelay });
  }

  // -- Navigation --

  async navigateAndWaitForLogin(): Promise<void> {
    await this.page.goto(FORMS_URL, { timeout: TIMEOUTS.loginWait });
    console.log(`Waiting for login (up to ${TIMEOUTS.loginWait / 1000}s)...`);

    await this.page.waitForFunction(
      () => {
        const url = window.location.href.toLowerCase();
        return url.includes('forms');
      },
      { timeout: TIMEOUTS.loginWait },
    );

    const newFormBtn = this.page.locator(EDITOR.newFormButton)
      .or(this.page.locator(EDITOR.newFormButtonAria))
      .or(this.page.locator(EDITOR.newFormButtonText));
    await newFormBtn.first().waitFor({ state: 'visible', timeout: TIMEOUTS.loginWait });
    console.log('Logged in, dashboard loaded.');
  }

  async dismissOverlays(): Promise<void> {
    for (const sel of [EDITOR.dismissBtn, EDITOR.closeBtn, EDITOR.gotItBtn]) {
      const btns = this.page.locator(sel);
      const count = await btns.count();
      for (let i = 0; i < count; i++) {
        try {
          await this.jsClick(btns.nth(i));
          await this.sleep(500);
        } catch { /* no overlay */ }
      }
    }
    await this.page.evaluate(() => {
      document.querySelectorAll('.ms-Overlay').forEach(el => el.remove());
    });
  }

  // -- Form creation --

  async createNewForm(title: string): Promise<void> {
    console.log(`Creating new form: '${title}'`);
    await this.dismissOverlays();
    await this.sleep(1000);

    const pagePromise = this.page.context().waitForEvent('page', { timeout: TIMEOUTS.elementWait });

    // Match Java: try data-automation-id first, then aria-label, then text
    let clicked = false;
    try {
      const btn = this.page.locator(EDITOR.newFormButton).first();
      if (await btn.count() > 0) {
        await this.jsClick(btn);
        clicked = true;
      }
    } catch { /* try next */ }

    if (!clicked) {
      try {
        const btn = this.page.locator(EDITOR.newFormButtonAria).first();
        if (await btn.count() > 0) {
          await this.jsClick(btn);
          clicked = true;
        }
      } catch { /* try next */ }
    }

    if (!clicked) {
      const btn = this.page.locator(EDITOR.newFormButtonText).first();
      await btn.click();
    }

    await this.sleep(3000);

    let editorPage: Page;
    try {
      editorPage = await pagePromise;
      this.page = editorPage;
      console.log('Switched to new form editor tab.');
    } catch {
      console.log('Form opened in same tab.');
    }

    await this.page.waitForURL(/design/i, { timeout: TIMEOUTS.elementWait });
    await this.sleep(3000);

    await this.setFormTitle(title);
  }

  private async setFormTitle(title: string): Promise<void> {
    const titlePrefix = title.substring(0, Math.min(10, title.length));

    // Intercept the next formapi request to capture its auth headers.
    // The page's own JS sets anti-forgery/auth headers on API calls —
    // we need those exact headers to make a successful PATCH.
    console.log('  Capturing auth headers from page API traffic...');
    const { headers: capturedHeaders, apiBaseUrl } = await this.captureApiRequestHeaders();

    if (Object.keys(capturedHeaders).length > 0 && apiBaseUrl) {
      const patchResult = await this.patchTitleViaApi(title, capturedHeaders, apiBaseUrl);
      if (patchResult.success) {
        // Reload to pick up the new title in the page
        await this.page.reload({ waitUntil: 'load' });
        await this.sleep(5000);
        const pageTitle = await this.page.title();
        if (pageTitle.includes(titlePrefix)) {
          console.log(`  Title set via API, confirmed: '${pageTitle}'`);
          return;
        }
        console.log(`  API PATCH succeeded but page title is: '${pageTitle}'`);
      } else {
        console.log(`  API PATCH failed: ${JSON.stringify(patchResult)}`);
      }
    } else {
      console.log('  Could not capture API headers — falling back to UI approach.');
    }

    // Fallback: click the title wrapper and type
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`  UI title attempt ${attempt}/2`);
      const titleWrapper = this.page.locator(EDITOR.formTitleDiv).first();
      await titleWrapper.scrollIntoViewIfNeeded().catch(() => {});
      await this.sleep(300);
      await titleWrapper.click();
      await this.sleep(1000);
      await titleWrapper.focus();
      await this.sleep(300);
      await this.page.keyboard.press('Control+a');
      await this.sleep(200);
      await this.page.keyboard.type(title, { delay: TIMEOUTS.slowTypeDelay });

      await this.page.keyboard.press('Tab');
      await this.sleep(1500);
      await this.clickAway();
      await this.sleep(2000);

      const pageTitle = await this.page.title();
      if (pageTitle.includes(titlePrefix)) {
        console.log(`  Title confirmed via page title: '${pageTitle}'`);
        return;
      }
      console.log(`  Title NOT confirmed (page title: '${pageTitle}')`);
    }

    console.log('Form title may not have persisted — continuing.');
  }

  private async captureApiRequestHeaders(): Promise<{ headers: Record<string, string>; apiBaseUrl: string }> {
    const captured: Record<string, string> = {};
    let capturedUrl = '';

    const headerPromise = new Promise<void>((resolve) => {
      const handler = (request: import('@playwright/test').Request) => {
        const url = request.url();
        if (url.includes('/formapi/api/') && url.includes('/users/') && !url.includes('.js')) {
          capturedUrl = url;
          const headers = request.headers();
          Object.assign(captured, headers);
          this.page.off('request', handler);
          resolve();
        }
      };
      this.page.on('request', handler);
      setTimeout(() => { this.page.off('request', handler); resolve(); }, 8000);
    });

    // Reload triggers GET requests to formapi with full auth headers
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await headerPromise;

    // Extract base URL (up to /users/{userId}) from the captured request
    const match = capturedUrl.match(/(https:\/\/[^/]+\/formapi\/api\/[^/]+\/users\/[^/]+)/);
    const apiBaseUrl = match?.[1] || '';

    const keys = Object.keys(captured);
    console.log(`  Captured ${keys.length} headers from: ${capturedUrl.substring(0, 100)}`);
    const authRelated = keys
      .filter(k => /auth|token|forgery|csrf|xsrf|bearer|ocp|x-|cookie/i.test(k))
      .map(k => `${k}: ${String(captured[k]).substring(0, 60)}...`);
    console.log('  Auth-related headers:', authRelated.join('\n    ') || 'none');

    return { headers: captured, apiBaseUrl };
  }

  private async patchTitleViaApi(
    title: string,
    capturedHeaders: Record<string, string>,
    apiBaseUrl: string,
  ): Promise<{ success: boolean; status?: number; body?: string; error?: string }> {
    const formId = new URL(this.page.url()).searchParams.get('id');
    if (!formId || !apiBaseUrl) {
      return { success: false, error: `Missing formId(${!!formId}) or apiBaseUrl(${!!apiBaseUrl})` };
    }

    const formUrl = `${apiBaseUrl}/forms('${formId}')`;
    console.log(`  PATCH target: ${formUrl.substring(0, 120)}...`);

    // Build headers from captured request — keep auth-relevant ones
    const patchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    for (const [key, value] of Object.entries(capturedHeaders)) {
      const lk = key.toLowerCase();
      if (lk === 'authorization' || lk === 'cookie' || lk.startsWith('x-') ||
          lk.includes('token') || lk.includes('forgery') || lk.includes('csrf') ||
          lk === 'ocp-apim-subscription-key') {
        patchHeaders[key] = value;
      }
    }

    console.log(`  Using ${Object.keys(patchHeaders).length} headers for PATCH`);

    try {
      const response = await this.page.request.patch(formUrl, {
        headers: patchHeaders,
        data: { title },
      });
      const status = response.status();
      const body = await response.text();
      console.log(`  PATCH response: ${status} ${body.substring(0, 150)}`);

      return { success: status >= 200 && status < 300, status, body: body.substring(0, 200) };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private async findTitleElement(): Promise<Locator | null> {
    for (const sel of [EDITOR.formTitleContentEditable, EDITOR.formTitleDiv, EDITOR.untitledFormDiv, EDITOR.untitledDiv]) {
      const loc = this.page.locator(sel);
      try {
        await loc.first().waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
        return loc.first();
      } catch { /* try next selector */ }
    }
    return null;
  }

  // -- Add questions --

  async addAllQuestions(template: FormTemplate): Promise<void> {
    const { orderedSections, branchRules } = template.branchPlan;

    let lastSectionTitle = '';
    for (const section of orderedSections) {
      // Create a new MS Forms section for each unique section title
      if (section.title !== lastSectionTitle) {
        // Skip section header for the very first section (MS Forms auto-creates it)
        if (lastSectionTitle !== '') {
          await this.addSection(section.title);
          await this.sleep(TIMEOUTS.betweenQuestions);
        }
        lastSectionTitle = section.title;
        console.log(`--- Page ${section.page}: ${section.title} ---`);
      }

      for (const field of section.fields) {
        await this.addQuestion(field);
        await this.sleep(TIMEOUTS.betweenQuestions);
      }
    }

    console.log(`All ${template.fields.length} questions added across ${orderedSections.length} section(s).`);

    // Configure branching rules after all questions and sections exist
    if (branchRules.length > 0) {
      console.log('Configuring branching rules...');
      const configurator = new BranchConfigurator(this.page);
      await configurator.configureBranching(branchRules);
    }
  }

  private async addQuestion(field: FormField): Promise<void> {
    console.log(`Adding question: '${field.label}' (${field.fieldType})`);

    switch (field.fieldType) {
      case 'text':
        await this.addTextQuestion(field, false);
        break;
      case 'text_long':
        await this.addTextQuestion(field, true);
        break;
      case 'choice_single':
        await this.addChoiceQuestion(field, 'single');
        break;
      case 'choice_multi':
        await this.addChoiceQuestion(field, 'multi');
        break;
      case 'choice_dropdown':
        await this.addChoiceQuestion(field, 'dropdown');
        break;
      case 'date':
        await this.addDateQuestion(field);
        break;
      case 'rating':
        await this.addRatingQuestion(field);
        break;
      case 'ranking':
        await this.addRankingQuestion(field);
        break;
      case 'likert':
        await this.addLikertQuestion(field);
        break;
      case 'nps':
        await this.addNpsQuestion(field);
        break;
      case 'file_upload':
        await this.addFileUploadQuestion(field);
        break;
      default:
        console.log(`Unknown field type '${field.fieldType}', skipping.`);
    }
  }

  // -- Question type adders (match Java exactly) --

  private async addTextQuestion(field: FormField, longAnswer: boolean): Promise<void> {
    await this.clickQuestionTypeButton('text');
    await this.setQuestionText(field.label);
    if (longAnswer) await this.toggleSwitch(EDITOR.longAnswerToggle, true);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addChoiceQuestion(field: FormField, mode: 'single' | 'multi' | 'dropdown'): Promise<void> {
    await this.clickQuestionTypeButton('choice');
    await this.setQuestionText(field.label);
    if (field.options.length > 0) await this.fillChoiceOptions(field.options);
    if (mode === 'multi') await this.toggleSwitch(EDITOR.multipleAnswersToggle, true);
    if (mode === 'dropdown') console.log('Dropdown mode not available in new Forms UI; using Choice with options.');
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addDateQuestion(field: FormField): Promise<void> {
    await this.clickQuestionTypeButton('date');
    await this.setQuestionText(field.label);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addRatingQuestion(field: FormField): Promise<void> {
    await this.clickQuestionTypeButton('rating');
    await this.setQuestionText(field.label);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addRankingQuestion(field: FormField): Promise<void> {
    await this.clickQuestionTypeButton('ranking');
    await this.setQuestionText(field.label);
    if (field.options.length > 0) await this.fillRankingOptions(field.options);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addLikertQuestion(field: FormField): Promise<void> {
    await this.clickQuestionTypeButton('likert');
    await this.setQuestionText(field.label);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addNpsQuestion(field: FormField): Promise<void> {
    await this.clickQuestionTypeButton('nps');
    await this.setQuestionText(field.label);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  private async addFileUploadQuestion(field: FormField): Promise<void> {
    await this.clickQuestionTypeButton('file_upload');
    await this.setQuestionText(field.label);
    await this.configureRestrictions(field);
    await this.setRequired(field.required);
    await this.clickAway();
  }

  async addSection(title: string): Promise<void> {
    console.log(`Adding section: '${title}'`);
    await this.clickQuestionTypeButton('section');
    await this.sleep(1000);

    const titleBox = this.page.locator(EDITOR.questionTitleTextbox).first();
    try {
      await titleBox.waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
      await titleBox.click();
      await this.sleep(TIMEOUTS.afterClick);
      await this.slowType(title);
      await this.sleep(TIMEOUTS.afterType);
    } catch {
      console.log('Could not set section title — continuing.');
    }
    await this.clickAway();
  }

  // -- Palette and type selection (match Java's openQuestionTypePalette + clickQuestionTypeButton) --

  private async openQuestionTypePalette(): Promise<void> {
    // First question: check if palette is already visible (matches Java)
    if (this.isFirstQuestion) {
      try {
        const paletteBtn = this.page.locator(EDITOR.paletteVisible);
        await paletteBtn.first().waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
        return;
      } catch { /* palette not visible, try clicking add button */ }
    }

    // Try 4 "Add new question" xpaths with scrollIntoView + JS click (matches Java exactly)
    const addNewXpaths = [
      "xpath=//button[contains(@aria-label, 'Add new question')]",
      "xpath=//button[contains(@aria-label, 'Insert new question')]",
      "xpath=//button[contains(text(), 'Add new question')]",
      "xpath=//button[contains(text(), 'Insert new question')]",
    ];

    for (const xpath of addNewXpaths) {
      try {
        const btn = this.page.locator(xpath).first();
        const count = await btn.count();
        if (count === 0) continue;

        await this.scrollAndJsClick(btn);
        await this.sleep(TIMEOUTS.afterClick);

        // Wait for palette to appear
        const paletteBtn = this.page.locator(EDITOR.paletteVisible);
        await paletteBtn.first().waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
        return;
      } catch { /* try next selector */ }
    }

    // Quick Start fallback (matches Java)
    try {
      const qsBtn = this.page.locator(EDITOR.quickStartBtn).first();
      await this.scrollAndJsClick(qsBtn);
      await this.sleep(TIMEOUTS.afterClick);
    } catch { /* no quick start button */ }
  }

  private async clickQuestionTypeButton(typeKey: string): Promise<void> {
    await this.openQuestionTypePalette();

    const label = QUESTION_TYPE_BUTTONS[typeKey];
    if (!label) throw new Error(`Unknown question type key: ${typeKey}`);

    // Match Java's 4-xpath fallback chain with scrollIntoView + JS click
    const selectors = [
      questionTypeButton(label),
      questionTypeButtonContains(label),
      questionTypeButtonText(label),
      questionTypeButtonContainsText(label),
    ];

    for (const sel of selectors) {
      try {
        const btn = this.page.locator(sel).first();
        const count = await btn.count();
        if (count === 0) continue;

        await this.scrollAndJsClick(btn);
        await this.sleep(TIMEOUTS.afterClick);
        this.isFirstQuestion = false;
        return;
      } catch { /* try next selector */ }
    }

    // Debug: log all visible buttons (matches Java's error logging)
    const allButtons = this.page.locator('button');
    const buttonCount = await allButtons.count();
    console.error(`Could not find '${label}' button. Visible buttons:`);
    for (let i = 0; i < Math.min(buttonCount, 20); i++) {
      try {
        const text = (await allButtons.nth(i).textContent())?.trim().substring(0, 40) || '';
        const aria = await allButtons.nth(i).getAttribute('aria-label') || '';
        if (text || aria) {
          console.error(`  button: text='${text}', aria='${aria}'`);
        }
      } catch { /* skip */ }
    }

    throw new Error(`Could not find question type button: '${label}' (key: ${typeKey})`);
  }

  // -- Question text and toggles (match Java's setQuestionText + active element pattern) --

  private async setQuestionText(text: string): Promise<void> {
    await this.sleep(TIMEOUTS.afterClick);

    // Try to find and click the question title textbox (matches Java)
    try {
      const qInput = this.page.locator(EDITOR.questionTitleTextbox).first();
      await qInput.waitFor({ state: 'visible', timeout: TIMEOUTS.elementWait });
      await qInput.click();
      await this.sleep(TIMEOUTS.afterClick);
    } catch {
      console.log('Question title textbox not found, using active element.');
    }

    // Type via active element with Ctrl+A, Delete, slowType (matches Java)
    await this.slowType(text);
    await this.sleep(TIMEOUTS.afterType);
  }

  private async setRequired(required: boolean): Promise<void> {
    try {
      const toggle = this.page.locator(EDITOR.requiredToggle).first();
      await toggle.waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
      const checked = await toggle.getAttribute('aria-checked');
      const isOn = checked === 'true';
      if (isOn !== required) {
        await this.jsClick(toggle);
        await this.sleep(TIMEOUTS.afterClick);
      }
    } catch {
      console.log('Required toggle not found — skipping.');
    }
  }

  private async toggleSwitch(selector: string, desiredState: boolean): Promise<void> {
    try {
      const toggle = this.page.locator(selector).first();
      await toggle.waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
      const checked = await toggle.getAttribute('aria-checked');
      if ((checked === 'true') !== desiredState) {
        await this.jsClick(toggle);
        await this.sleep(TIMEOUTS.afterClick);
      }
    } catch {
      console.log(`Toggle '${selector}' not found — skipping.`);
    }
  }

  private resolveValidation(field: FormField): { typeText: string; conditionText: string; value: string } | null {
    const validation = field.validation?.trim() || '';

    // Explicit CSV validation takes priority
    if (validation) {
      const minMatch = validation.match(/min\s*(\d+)\s*char/i);
      const maxMatch = validation.match(/max\s*(\d+)\s*char/i);
      if (minMatch) return { typeText: 'Length', conditionText: 'Min count', value: minMatch[1] };
      if (maxMatch) return { typeText: 'Length', conditionText: 'Max count', value: maxMatch[1] };
    }

    // Auto-detect defaults from field name and rawType for text fields
    if (field.fieldType !== 'text' && field.fieldType !== 'text_long') return null;

    const label = field.label.toLowerCase();
    const rawType = field.rawType.toLowerCase();

    if (rawType.includes('email') || label.includes('email')) {
      return { typeText: 'Email', conditionText: '', value: '' };
    }
    if (rawType.includes('phone') || label.includes('phone') || label.includes('contact number') || label.includes('mobile')) {
      return { typeText: 'Number', conditionText: 'Equal to', value: '10' };
    }
    if (label.includes('name') || label.includes('full name') || label.includes('first name') || label.includes('last name')) {
      return { typeText: 'Length', conditionText: 'Min count', value: '3' };
    }

    return null;
  }

  private async configureRestrictions(field: FormField): Promise<void> {
    const resolved = this.resolveValidation(field);

    if (!resolved) {
      if (field.validation) {
        console.log(`Validation '${field.validation}' not mappable to restrictions — skipping.`);
      }
      return;
    }

    const source = field.validation ? field.validation : `auto:${resolved.conditionText} ${resolved.value}`;
    console.log(`Configuring restrictions for '${field.label}': ${source}`);

    try {
      const questionMoreBtn = this.page.locator(
        "[role='button'][aria-label*='More settings for question']"
      ).first();

      if (await questionMoreBtn.count() === 0) {
        console.log(`  Question "More settings" button not visible — skipping restrictions.`);
        return;
      }

      await questionMoreBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await this.sleep(300);
      await questionMoreBtn.click();
      await this.sleep(1500);

      const restrictionsItem = this.page.locator(EDITOR.restrictionsMenuItem).first();
      await restrictionsItem.waitFor({ state: 'visible', timeout: TIMEOUTS.shortWait });
      await restrictionsItem.click();
      await this.sleep(2000);

      await this.selectRestrictionDropdownOption(0, resolved.typeText);

      if (resolved.conditionText && resolved.value) {
        await this.selectRestrictionDropdownOption(1, resolved.conditionText);
        await this.setRestrictionValue(resolved.value);
      }

      console.log(`Restrictions set for '${field.label}': ${resolved.conditionText} ${resolved.value}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Could not set restrictions for '${field.label}': ${msg}`);
    }
  }

  private async selectRestrictionDropdownOption(dropdownIndex: number, optionText: string): Promise<void> {
    const dropdowns = this.page.locator("[role='button'][aria-haspopup='listbox']");
    const count = await dropdowns.count();
    if (count <= dropdownIndex) {
      console.log(`  Only ${count} restriction dropdown(s) found, need index ${dropdownIndex}.`);
      return;
    }

    await dropdowns.nth(dropdownIndex).click();
    await this.sleep(500);

    const option = this.page.locator(`[role='option']`).filter({ hasText: optionText }).first();
    if (await option.count() > 0) {
      await option.click();
      await this.sleep(500);
    } else {
      console.log(`  Option "${optionText}" not found in restriction dropdown.`);
      await this.page.keyboard.press('Escape');
      await this.sleep(300);
    }
  }

  private async setRestrictionValue(value: string): Promise<void> {
    await this.sleep(1000);

    // After selecting a condition like "Min count", the value input appears as
    // input[aria-label="From:"] with placeholder "Number"
    const inputSelectors = [
      "input[aria-label='From:']",
      "input[aria-label='To:']",
      "input[placeholder='Number']",
      EDITOR.restrictionValueInput,
    ];

    for (const sel of inputSelectors) {
      try {
        const input = this.page.locator(sel).first();
        if (await input.count() === 0) continue;
        const box = await input.boundingBox();
        if (!box || box.width === 0) continue;

        await input.click();
        await this.sleep(300);
        await input.fill(value);
        await this.sleep(TIMEOUTS.afterType);
        return;
      } catch { /* try next */ }
    }

    console.log('  Could not find restriction value input field.');
  }

  // -- Choice/ranking option filling (matches Java's fillChoiceOptions / fillRankingOptions) --

  private async fillChoiceOptions(options: string[]): Promise<void> {
    for (let i = 0; i < options.length; i++) {
      let optionBoxes = this.page.locator(EDITOR.choiceOptionTextbox);
      const currentCount = await optionBoxes.count();

      if (i >= currentCount) {
        try {
          const addBtn = this.page.locator(EDITOR.addOptionBtn).first();
          await this.jsClick(addBtn);
          await this.sleep(TIMEOUTS.afterClick);
          optionBoxes = this.page.locator(EDITOR.choiceOptionTextbox);
        } catch {
          console.log(`Could not add option '${options[i]}'.`);
          continue;
        }
      }

      const box = optionBoxes.nth(i);
      await box.click();
      await this.sleep(TIMEOUTS.afterClick);

      await this.slowType(options[i]);
      await this.sleep(TIMEOUTS.afterType);
    }
  }

  private async fillRankingOptions(options: string[]): Promise<void> {
    for (let i = 0; i < options.length; i++) {
      let optionBoxes = this.page.locator(EDITOR.rankingOptionTextbox);
      const currentCount = await optionBoxes.count();

      if (i >= currentCount) {
        try {
          const addBtn = this.page.locator(EDITOR.addOptionBtn).first();
          await this.jsClick(addBtn);
          await this.sleep(TIMEOUTS.afterClick);
          optionBoxes = this.page.locator(EDITOR.rankingOptionTextbox);
        } catch {
          console.log(`Could not add ranking option '${options[i]}'.`);
          continue;
        }
      }

      const box = optionBoxes.nth(i);
      await box.click();
      await this.sleep(TIMEOUTS.afterClick);

      await this.slowType(options[i]);
      await this.sleep(TIMEOUTS.afterType);
    }
  }

  getEditorUrl(): string {
    return this.stripBranchingParams(this.page.url());
  }

  private stripBranchingParams(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('topview');
      parsed.searchParams.delete('branchingelementid');
      return parsed.toString();
    } catch {
      return url;
    }
  }

  // -- Response URL extraction (matches Java's getResponseUrl) --

  async getResponseUrl(): Promise<string> {
    console.log('Extracting response URL...');

    try {
      const collectBtn = this.page.locator(EDITOR.collectResponsesBtn).first();
      await collectBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.elementWait });
      await this.jsClick(collectBtn);
      await this.sleep(2000);
    } catch {
      console.log('Could not find "Collect responses" button — falling back to URL construction.');
    }

    // Try the link input
    try {
      const linkInput = this.page.locator(EDITOR.responseLinkInput).first();
      await linkInput.waitFor({ state: 'visible', timeout: TIMEOUTS.elementWait });
      const url = await linkInput.getAttribute('value');
      if (url) {
        console.log(`Response URL: ${url}`);
        return url;
      }
    } catch { /* try anchor fallback */ }

    // Try anchor link
    try {
      const linkAnchor = this.page.locator(EDITOR.responseLinkAnchor).first();
      const href = await linkAnchor.getAttribute('href');
      if (href) {
        console.log(`Response URL (anchor): ${href}`);
        return href;
      }
    } catch { /* fall back to URL construction */ }

    // Last resort: construct from current URL
    const cleanUrl = this.stripBranchingParams(this.page.url());
    const constructed = cleanUrl
      .replace('DesignPageV2', 'ResponsePage')
      .replace(/&subpage=design/g, '&subpage=response');
    console.log(`Constructed response URL: ${constructed}`);
    return constructed;
  }

  // -- Utilities --

  private async clickAway(): Promise<void> {
    try {
      const desc = this.page.locator(EDITOR.formDescriptionDiv).first();
      if (await desc.count() > 0) {
        await desc.click();
        await this.sleep(500);
        return;
      }
    } catch { /* fall through */ }
    await this.page.locator('body').click();
    await this.sleep(500);
  }

  private sleep(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms);
  }
}
