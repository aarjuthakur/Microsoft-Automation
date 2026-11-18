import { type Page, type Locator } from '@playwright/test';
import { EDITOR, questionCardByLabel, goToOption } from './selectors';
import { TIMEOUTS } from '../config/forms.config';
import type { BranchRule, BranchRoute } from '../models/types';

export class BranchConfigurator {
  constructor(private page: Page) {}

  async configureBranching(branchRules: BranchRule[]): Promise<void> {
    if (branchRules.length === 0) return;

    console.log(`Configuring ${branchRules.length} branching rule(s)...`);

    for (const rule of branchRules) {
      try {
        await this.configureRule(rule);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`Branching failed for '${rule.triggerQuestionLabel}': ${msg}`);
        console.log('You may need to configure this branching rule manually in MS Forms.');
        this.logManualInstructions(rule);
      }
    }
  }

  private async configureRule(rule: BranchRule): Promise<void> {
    console.log(`Setting up branching on: '${rule.triggerQuestionLabel}' (${rule.triggerFieldType})`);

    await this.selectTriggerQuestion(rule.triggerQuestionLabel);
    await this.openBranchingPanel();

    const dropdowns = await this.findGoToDropdowns();
    if (dropdowns === 0) {
      console.log('No "Go to" dropdowns found. Branching UI may have changed.');
      this.logManualInstructions(rule);
      return;
    }

    switch (rule.triggerFieldType) {
      case 'rating':
        await this.configureRatingBranching(rule.routes, dropdowns);
        break;
      case 'nps':
        await this.configureNpsBranching(rule.routes, dropdowns);
        break;
      case 'choice_single':
      case 'choice_multi':
      case 'choice_dropdown':
        await this.configureChoiceBranching(rule.routes, dropdowns);
        break;
      default:
        console.log(`Branching not supported for field type '${rule.triggerFieldType}'.`);
        this.logManualInstructions(rule);
    }

    await this.closeBranchingPanel();
  }

  private async selectTriggerQuestion(label: string): Promise<void> {
    // Dismiss any open panels/dropdowns first
    await this.page.keyboard.press('Escape');
    await this.sleep(500);
    await this.page.keyboard.press('Escape');
    await this.sleep(300);

    // Click the center of the viewport to deselect — avoid top-left (hits O365 app launcher)
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 720 };
    await this.page.mouse.click(viewport.width / 2, viewport.height / 2);
    await this.sleep(800);

    const selectors = [
      questionCardByLabel(label),
      `text="${label}"`,
    ];

    for (const sel of selectors) {
      try {
        const card = this.page.locator(sel).first();
        if (await card.count() === 0) continue;

        await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await this.sleep(500);
        await card.click();
        await this.sleep(2000);

        const moreBtn = this.page.locator("[role='button'][aria-label*='More settings for question']");
        if (await moreBtn.count() > 0) return;

        // Double-click might be needed to enter edit mode
        await card.dblclick();
        await this.sleep(1500);
        if (await moreBtn.count() > 0) return;
      } catch { /* try next */ }
    }

    // Fallback: find by text content with getByText
    try {
      const byText = this.page.getByText(label, { exact: false }).first();
      await byText.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await this.sleep(500);
      await byText.click();
      await this.sleep(2000);
    } catch {
      console.log(`  Could not find question card for '${label}'.`);
    }
  }

  private async openBranchingPanel(): Promise<void> {
    const questionMoreBtn = this.page.locator(
      "[role='button'][aria-label*='More settings for question']"
    ).first();

    if (await questionMoreBtn.count() === 0) {
      throw new Error('Question-level "More settings" button not found — question may not be in edit mode.');
    }

    await questionMoreBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await this.sleep(300);
    await questionMoreBtn.click();
    await this.sleep(1500);

    const branchItem = this.page.locator(EDITOR.branchingMenuItem).first();
    if (await branchItem.count() === 0) {
      throw new Error('"Add branching" menu item not found in question menu.');
    }

    await branchItem.click();
    await this.sleep(2000);
  }

  private async findGoToDropdowns(): Promise<number> {
    let dropdowns = this.page.locator(EDITOR.goToDropdown);
    let count = await dropdowns.count();
    if (count > 0) return count;

    dropdowns = this.page.locator(EDITOR.goToDropdownAlt);
    count = await dropdowns.count();
    if (count > 0) return count;

    console.log('No branching "Next" dropdowns found.');
    return 0;
  }

  private async configureRatingBranching(routes: BranchRoute[], dropdownCount: number): Promise<void> {
    console.log(`Rating branching: ${dropdownCount} dropdown(s) for stars 1-5`);
    const dropdowns = this.page.locator(EDITOR.goToDropdown);

    for (let i = 0; i < Math.min(dropdownCount, 5); i++) {
      const starValue = i + 1;
      const targetSection = this.resolveTargetForValue(starValue, routes);
      if (!targetSection) continue;

      await this.setGoToDropdown(dropdowns.nth(i), targetSection);
    }
  }

  private async configureNpsBranching(routes: BranchRoute[], dropdownCount: number): Promise<void> {
    console.log(`NPS branching: ${dropdownCount} dropdown(s) for scores 0-10`);
    const dropdowns = this.page.locator(EDITOR.goToDropdown);

    for (let i = 0; i < Math.min(dropdownCount, 11); i++) {
      const scoreValue = i;
      const targetSection = this.resolveTargetForValue(scoreValue, routes);
      if (!targetSection) continue;

      await this.setGoToDropdown(dropdowns.nth(i), targetSection);
    }
  }

  private async configureChoiceBranching(routes: BranchRoute[], dropdownCount: number): Promise<void> {
    console.log(`Choice branching: ${routes.length} route(s), ${dropdownCount} dropdown(s)`);
    const dropdowns = this.page.locator(EDITOR.goToDropdown);

    // For choice questions, routes map option values to sections.
    // The "Next" dropdowns appear for each answer option plus possibly the question/section.
    // We try to match routes to dropdowns by position.
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      if (i >= dropdownCount) {
        console.log(`  No dropdown at index ${i} for '${route.condition.value}' → '${route.targetSectionTitle}'`);
        continue;
      }
      try {
        console.log(`  Setting route ${i}: '${route.condition.value}' → '${route.targetSectionTitle}'`);
        await this.setGoToDropdown(dropdowns.nth(i), route.targetSectionTitle);
      } catch {
        console.log(`  Could not set route for '${route.condition.value}' → '${route.targetSectionTitle}'.`);
      }
    }
  }

  private async setGoToDropdown(dropdown: Locator, sectionTitle: string): Promise<void> {
    try {
      await dropdown.click();
      await this.sleep(800);

      // MS Forms shows section options as [role='option'] with text like "2. Detail Section"
      const exactOption = this.page.locator(`[role='option']`).filter({ hasText: sectionTitle }).first();
      if (await exactOption.count() > 0) {
        await exactOption.click();
        await this.sleep(500);
        console.log(`  Set branching → "${sectionTitle}"`);
        return;
      }

      const partialOption = this.page.getByText(sectionTitle, { exact: false }).first();
      if (await partialOption.count() > 0) {
        await partialOption.click({ timeout: TIMEOUTS.shortWait });
        await this.sleep(500);
        console.log(`  Set branching → "${sectionTitle}" (partial match)`);
        return;
      }

      await this.page.keyboard.press('Escape');
      await this.sleep(300);
      console.log(`  Could not find "${sectionTitle}" in branching dropdown.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  Could not select "${sectionTitle}": ${msg}`);
    }
  }

  private resolveTargetForValue(value: number, routes: BranchRoute[]): string | null {
    for (const route of routes) {
      const threshold = Number(route.condition.value);
      if (isNaN(threshold)) continue;

      let matches = false;
      switch (route.condition.operator) {
        case '>=': matches = value >= threshold; break;
        case '<=': matches = value <= threshold; break;
        case '>': matches = value > threshold; break;
        case '<': matches = value < threshold; break;
        case '==': matches = value === threshold; break;
        case '!=': matches = value !== threshold; break;
      }

      if (matches) return route.targetSectionTitle;
    }
    return null;
  }

  private async closeBranchingPanel(): Promise<void> {
    // Try clicking "Done" if available
    try {
      const doneBtn = this.page.locator(EDITOR.branchingDoneBtn).first();
      if (await doneBtn.count() > 0) {
        await doneBtn.click();
        await this.sleep(1000);
      }
    } catch { /* panel may auto-close */ }

    // Dismiss any remaining popups
    await this.page.keyboard.press('Escape');
    await this.sleep(500);
    await this.page.keyboard.press('Escape');
    await this.sleep(300);

    // Click the center of the viewport to deselect — avoid top-left (hits O365 app launcher)
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 720 };
    await this.page.mouse.click(viewport.width / 2, viewport.height / 2);
    await this.sleep(1000);
  }

  private logManualInstructions(rule: BranchRule): void {
    console.log(`  Manual branching needed for '${rule.triggerQuestionLabel}':`);
    for (const route of rule.routes) {
      console.log(`    IF ${route.condition.rawExpression} → Go to "${route.targetSectionTitle}"`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms);
  }
}
