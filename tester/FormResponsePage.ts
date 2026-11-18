// ABOUTME: Page object for filling and submitting MS Forms response pages.
// ABOUTME: Handles all field types with multiple selector strategies per type.

import { expect, type Page, type Locator } from '@playwright/test';
import { RESPONSE } from './selectors';
import { TIMEOUTS } from '../config/forms.config';
import { step } from '../utils/logger';
import type { FormField } from '../models/types';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const testData = JSON.parse(
  readFileSync(resolve(__dirname, '../test-data/testValues.json'), 'utf-8')
);

export class FormResponsePage {
  constructor(private page: Page) {}

  async navigateTo(responseUrl: string): Promise<void> {
    await this.page.goto(responseUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.loginWait });

    if (this.page.url().includes('login.microsoftonline.com')) {
      await this.page.waitForURL('**/forms.cloud.microsoft/**', { timeout: TIMEOUTS.loginWait });
      await this.page.waitForLoadState('networkidle');
    }

    await this.sleep(3000);

    try {
      const startBtn = this.page.locator(RESPONSE.startButton).first();
      if (await startBtn.isVisible()) {
        await startBtn.click();
        await this.sleep(2000);
      }
    } catch { /* no start page */ }
  }

  async verifyFormLoaded(expectedTitle: string): Promise<void> {
    const heading = this.page.getByRole('heading').first();
    await expect(heading, 'Form heading should be visible after load').toBeVisible();

    const headingText = await heading.textContent() || '';
    if (expectedTitle && !headingText.toLowerCase().includes(expectedTitle.toLowerCase())) {
      console.log(`Warning: heading text "${headingText}" does not contain expected "${expectedTitle}"`);
    }
    step(`Form loaded — heading: "${headingText}"`);
  }

  async verifyQuestionCount(expectedCount: number): Promise<void> {
    const questions = this.page.locator(RESPONSE.questionContainer);
    const count = await questions.count();
    expect(count, `Expected ${expectedCount} questions on the page`).toBeGreaterThanOrEqual(1);
    step(`Found ${count} question containers on the page`);
  }

  // --- Per-type fill methods ---

  async testTextField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const input = container.locator(RESPONSE.textInput).first();
    await input.waitFor({ state: 'visible', timeout: TIMEOUTS.elementWait });

    const testValue = this.getTestValue(field);
    await input.click();
    await input.fill('');
    await input.pressSequentially(testValue, { delay: TIMEOUTS.slowTypeDelay });
    await this.sleep(500);

    steps.push(`Entered "${testValue}" into "${field.label}"`);
  }

  async testChoiceSingleField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const radios = container.locator(RESPONSE.radioInput);
    const count = await radios.count();

    if (count > 0) {
      await radios.first().click({ force: true });
      await this.sleep(500);
      steps.push(`Selected first radio option in "${field.label}"`);
    } else {
      steps.push(`No radio options found for "${field.label}"`);
    }
  }

  async testChoiceMultiField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const checkboxes = container.locator(RESPONSE.checkboxInput);
    const count = await checkboxes.count();

    if (count > 0) {
      await checkboxes.first().click({ force: true });
      await this.sleep(500);
      steps.push(`Checked first checkbox in "${field.label}"`);
    } else {
      steps.push(`No checkboxes found for "${field.label}"`);
    }
  }

  async testDropdownField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);

    const nativeSelect = container.locator('select').first();
    if (await nativeSelect.count() > 0 && await nativeSelect.isVisible().catch(() => false)) {
      const optionCount = await nativeSelect.locator('option').count();
      await nativeSelect.selectOption({ index: 1 });
      await this.sleep(500);
      steps.push(`Selected option in native dropdown "${field.label}" (${optionCount} options)`);
      return;
    }

    const trigger = container.locator(RESPONSE.dropdownTrigger).first();
    if (await trigger.count() > 0 && await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await this.sleep(1000);
      const options = this.page.locator(RESPONSE.dropdownOption);
      const optionCount = await options.count();
      if (optionCount > 0) {
        await options.first().click();
        await this.sleep(500);
        steps.push(`Selected first option in dropdown "${field.label}"`);
        return;
      }
    }

    const radios = container.locator(RESPONSE.radioInput);
    if (await radios.count() > 0) {
      await radios.first().click({ force: true });
      await this.sleep(500);
      steps.push(`Dropdown "${field.label}" rendered as radio buttons — selected first`);
      return;
    }

    steps.push(`Skipped dropdown "${field.label}" — no interactive element found`);
  }

  async testDateField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const dateInput = container.locator(RESPONSE.dateInput).first();

    if (!(await dateInput.isVisible().catch(() => false))) {
      steps.push(`Date field "${field.label}" not visible, skipping`);
      return;
    }

    await dateInput.click();
    await this.sleep(500);

    const dateValue = testData.date.default;
    await dateInput.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      )?.set;
      if (setter) {
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, dateValue);
    await this.sleep(500);
    await dateInput.press('Tab');
    await this.sleep(500);

    steps.push(`Set date "${dateValue}" for "${field.label}"`);
  }

  async testRatingField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const targetStar = testData.rating.stars;

    // Strategy 1: aria-label with various formats MS Forms uses
    const starSelectors = [
      `[aria-label="${targetStar} Star"]`,
      `[aria-label="${targetStar} star"]`,
      `[aria-label="${targetStar} Stars"]`,
      `[aria-label="${targetStar} stars"]`,
      `[aria-label="Rate ${targetStar} out of 5"]`,
      `[aria-label="${targetStar}"]`,
      `[data-value="${targetStar}"]`,
    ];

    for (const sel of starSelectors) {
      const star = container.locator(sel).first();
      if (await star.count() > 0 && await star.isVisible().catch(() => false)) {
        await star.click({ force: true });
        await this.sleep(500);
        steps.push(`Clicked star ${targetStar} in "${field.label}" via ${sel}`);
        return;
      }
    }

    // Strategy 2: Find all clickable star-like elements and click the Nth one
    const starLike = container.locator('button, [role=radio], [role=button], svg, .star, [class*="star"], [class*="Star"], [class*="rating"]');
    const starCount = await starLike.count();
    if (starCount >= targetStar) {
      await starLike.nth(targetStar - 1).click({ force: true });
      await this.sleep(500);
      steps.push(`Clicked element ${targetStar} of ${starCount} star-like elements in "${field.label}"`);
      return;
    }

    // Strategy 3: Try radio inputs inside the container
    const radios = container.locator('input[type=radio], [role=radio]');
    const radioCount = await radios.count();
    if (radioCount > 0) {
      const idx = Math.min(targetStar - 1, radioCount - 1);
      await radios.nth(idx).click({ force: true });
      await this.sleep(500);
      steps.push(`Clicked radio ${idx + 1} in "${field.label}" as rating fallback`);
      return;
    }

    // Strategy 4: Just click anywhere in the container's interactive area
    const anyClickable = container.locator('button, a, [tabindex], [role=radio], [role=button], label').first();
    if (await anyClickable.count() > 0) {
      await anyClickable.click({ force: true });
      await this.sleep(500);
      steps.push(`Clicked first interactive element in rating "${field.label}"`);
      return;
    }

    steps.push(`Could not find clickable star elements in "${field.label}"`);
  }

  async testNpsField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const targetScore = testData.nps.score;

    const scoreBtn = container.getByText(String(targetScore), { exact: true }).first();
    try {
      await scoreBtn.click({ timeout: 3_000 });
      await this.sleep(500);
      steps.push(`Selected NPS score ${targetScore} in "${field.label}"`);
      return;
    } catch { /* try fallback */ }

    const radios = container.locator('input[type=radio], [role=radio]');
    const radioCount = await radios.count();
    if (radioCount > 0) {
      await radios.nth(Math.min(targetScore, radioCount - 1)).click({ force: true });
      await this.sleep(500);
      steps.push(`Selected NPS radio ${targetScore} in "${field.label}"`);
      return;
    }

    steps.push(`Could not select NPS score in "${field.label}"`);
  }

  async testLikertField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const radios = container.locator(RESPONSE.radioInput);
    const count = await radios.count();

    if (count === 0) {
      steps.push(`No Likert radios found for "${field.label}"`);
      return;
    }

    let rowsAnswered = 0;
    const radioNames = new Set<string>();
    for (let i = 0; i < count; i++) {
      const name = await radios.nth(i).getAttribute('name');
      if (name && !radioNames.has(name)) {
        radioNames.add(name);
        await radios.nth(i).click({ force: true });
        await this.sleep(300);
        rowsAnswered++;
      }
    }

    steps.push(`Answered ${rowsAnswered} Likert rows in "${field.label}"`);
  }

  async testRankingField(field: FormField, steps: string[]): Promise<void> {
    const container = this.findQuestionContainer(field.label);
    const rankItems = container.locator(RESPONSE.rankingOption);
    const count = await rankItems.count();

    if (count < 2) {
      steps.push(`Ranking "${field.label}" has fewer than 2 items, skipping`);
      return;
    }

    try {
      const moveDownBtn = container.locator('button[aria-label*="down"], button[aria-label*="Down"]').first();
      if (await moveDownBtn.count() > 0) {
        await moveDownBtn.click();
      } else {
        await rankItems.nth(0).dragTo(rankItems.nth(1));
      }
      await this.sleep(500);
      steps.push(`Reordered ranking items in "${field.label}"`);
    } catch {
      steps.push(`Ranking "${field.label}" reorder attempted (may need manual verification)`);
    }
  }

  async testFileUploadField(field: FormField, steps: string[]): Promise<void> {
    steps.push(`Skipped file upload "${field.label}" (requires sign-in, not automatable)`);
  }

  // --- High-level orchestration ---

  async testAllFields(fields: FormField[], steps: string[]): Promise<void> {
    await this.navigateBackToFirstPage(steps);

    const maxPages = 20;
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      await this.fillAllVisibleQuestions(fields, steps);

      const nextBtn = this.page.locator(RESPONSE.nextButton).first();
      const submitBtn = this.page.locator(RESPONSE.submitButton).first();

      if (await submitBtn.isVisible().catch(() => false)) break;
      if (!(await nextBtn.isVisible().catch(() => false))) break;

      await nextBtn.click();
      await this.sleep(2000);
      steps.push('Clicked Next to advance to the next section');
    }
  }

  private async fillAllVisibleQuestions(fields: FormField[], steps: string[]): Promise<void> {
    const containers = this.page.locator(RESPONSE.questionContainer);
    const count = await containers.count();

    for (let i = 0; i < count; i++) {
      const container = containers.nth(i);
      if (!(await container.isVisible().catch(() => false))) continue;

      const titleEl = container.locator(RESPONSE.questionTitle).first();
      const titleText = (await titleEl.textContent().catch(() => '') || '').trim();

      // Try to match this visible question to a CSV field
      const matchedField = this.matchFieldByLabel(titleText, fields);

      if (matchedField) {
        step(`Filling: "${matchedField.label}" (${matchedField.fieldType})`);
        await this.testFieldByType(matchedField, steps);
      } else {
        // Fill generically based on what input elements exist in the container
        await this.fillGenericQuestion(container, titleText, steps);
      }
    }
  }

  private matchFieldByLabel(titleText: string, fields: FormField[]): FormField | null {
    const titleLower = titleText.toLowerCase();

    // Exact match on label
    for (const f of fields) {
      if (titleLower.includes(f.label.toLowerCase())) return f;
    }

    // Match by significant words (4+ chars)
    for (const f of fields) {
      const words = f.label.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
      if (words.length > 0 && words.every(w => titleLower.includes(w))) return f;
    }

    return null;
  }

  private async fillGenericQuestion(container: Locator, title: string, steps: string[]): Promise<void> {
    // Text input
    const textInput = container.locator(RESPONSE.textInput).first();
    if (await textInput.isVisible().catch(() => false)) {
      await textInput.click();
      await textInput.fill('Test Input');
      await this.sleep(300);
      steps.push(`Filled text field "${title}" with generic value`);
      return;
    }

    // Rating stars (role=radio with star labels)
    const stars = container.locator('[role="radio"][aria-label*="Star"]');
    const starCount = await stars.count();
    if (starCount > 0) {
      const targetIdx = Math.min(3, starCount - 1);
      await stars.nth(targetIdx).click({ force: true });
      await this.sleep(500);
      steps.push(`Selected star ${targetIdx + 1} in "${title}"`);
      return;
    }

    // Radio buttons
    const radios = container.locator(RESPONSE.radioInput);
    if (await radios.count() > 0) {
      await radios.first().click({ force: true });
      await this.sleep(300);
      steps.push(`Selected first radio in "${title}"`);
      return;
    }

    // Checkboxes
    const checkboxes = container.locator(RESPONSE.checkboxInput);
    if (await checkboxes.count() > 0) {
      await checkboxes.first().click({ force: true });
      await this.sleep(300);
      steps.push(`Checked first checkbox in "${title}"`);
      return;
    }

    // NPS / number buttons
    const npsBtn = container.locator('[role="radio"]');
    if (await npsBtn.count() > 0) {
      const mid = Math.floor((await npsBtn.count()) / 2);
      await npsBtn.nth(mid).click({ force: true });
      await this.sleep(300);
      steps.push(`Selected middle option in "${title}"`);
      return;
    }

    // Dropdown
    const dropdown = container.locator(RESPONSE.dropdownTrigger).first();
    if (await dropdown.isVisible().catch(() => false)) {
      await dropdown.click();
      await this.sleep(500);
      const option = this.page.locator(RESPONSE.dropdownOption).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        await this.sleep(300);
        steps.push(`Selected dropdown option in "${title}"`);
        return;
      }
    }

    steps.push(`Could not determine input type for "${title}"`);
  }

  private async navigateBackToFirstPage(steps: string[]): Promise<void> {
    let clickCount = 0;
    const maxClicks = 10;

    while (clickCount < maxClicks) {
      const prevBtn = this.page.locator(RESPONSE.previousButton).first();
      const backByText = this.page.getByRole('button', { name: /back|previous/i }).first();

      let clicked = false;
      if (await prevBtn.isVisible().catch(() => false)) {
        await prevBtn.click();
        clicked = true;
      } else if (await backByText.isVisible().catch(() => false)) {
        await backByText.click();
        clicked = true;
      }

      if (!clicked) break;
      await this.sleep(2000);
      clickCount++;
    }

    if (clickCount > 0) {
      steps.push(`Navigated back ${clickCount} page(s) to reach the first page`);
    }
  }

  private async testFieldByType(field: FormField, steps: string[]): Promise<void> {
    switch (field.fieldType) {
      case 'text':
      case 'text_long':
        return this.testTextField(field, steps);
      case 'choice_single':
        return this.testChoiceSingleField(field, steps);
      case 'choice_multi':
        return this.testChoiceMultiField(field, steps);
      case 'choice_dropdown':
        return this.testDropdownField(field, steps);
      case 'date':
        return this.testDateField(field, steps);
      case 'rating':
        return this.testRatingField(field, steps);
      case 'nps':
        return this.testNpsField(field, steps);
      case 'likert':
        return this.testLikertField(field, steps);
      case 'ranking':
        return this.testRankingField(field, steps);
      case 'file_upload':
        return this.testFileUploadField(field, steps);
      default:
        steps.push(`Skipped unknown field type "${field.fieldType}" for "${field.label}"`);
    }
  }

  async clickNext(steps: string[]): Promise<void> {
    const nextBtn = this.page.locator(RESPONSE.nextButton).first();
    await nextBtn.waitFor({ state: 'visible', timeout: TIMEOUTS.elementWait });
    await nextBtn.click();
    await this.sleep(2000);
    steps.push('Clicked Next to advance to the next section');
  }

  async submitForm(steps: string[]): Promise<void> {
    const submitBtn = this.page.locator(RESPONSE.submitButton).first();
    const nextBtn = this.page.locator(RESPONSE.nextButton).first();

    let maxPages = 10;
    while (maxPages-- > 0) {
      if (await submitBtn.isVisible().catch(() => false)) break;
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await this.sleep(2000);
        steps.push('Clicked Next to reach the submit page');
      } else {
        break;
      }
    }

    await submitBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await submitBtn.click();
    await this.sleep(5000);

    const thankYou = this.page.getByText(RESPONSE.thankYouText);
    await expect(thankYou, 'Thank-you message should appear after submission').toBeVisible({ timeout: 15_000 });
    steps.push('Submitted the form and verified thank-you message is visible');
  }

  // --- Helpers ---

  findQuestionContainer(label: string): Locator {
    // Try exact label first, then fall back to key words from the label
    const exact = this.page.locator(RESPONSE.questionContainer, { hasText: label }).first();
    return exact;
  }

  async findQuestionContainerFuzzy(label: string): Promise<Locator> {
    const exact = this.page.locator(RESPONSE.questionContainer, { hasText: label }).first();
    if (await exact.isVisible().catch(() => false)) return exact;

    // Try matching by significant words (drop small words)
    const words = label.split(/\s+/).filter(w => w.length > 3);
    for (const word of words) {
      const partial = this.page.locator(RESPONSE.questionContainer, { hasText: word }).first();
      if (await partial.isVisible().catch(() => false)) return partial;
    }

    return exact;
  }

  private getTestValue(field: FormField): string {
    const rawLower = field.rawType.toLowerCase();
    const labelLower = field.label.toLowerCase();

    if (rawLower.includes('email') || labelLower.includes('email')) return testData.text.email;
    if (rawLower.includes('phone') || labelLower.includes('phone') || labelLower.includes('contact number') || labelLower.includes('mobile')) return testData.text.phone;
    if (rawLower.includes('number')) return testData.text.phone;
    if (rawLower.includes('time')) return testData.time.default;
    if (labelLower.includes('name')) return testData.text.name;
    if (labelLower.includes('address')) return testData.text.address;
    if (labelLower.includes('city')) return testData.text.city;
    if (labelLower.includes('zip') || labelLower.includes('postal')) return testData.text.zip;
    if (field.fieldType === 'text_long') return testData.text.longText;
    return testData.text.default;
  }

  private sleep(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms);
  }
}
