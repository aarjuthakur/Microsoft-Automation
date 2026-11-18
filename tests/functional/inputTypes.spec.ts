import { test, expect } from '../../fixtures/formFixture';
import type { FormField } from '../../models/types';

const responseUrl = process.env.RESPONSE_URL;

test.beforeEach(async () => {
  test.skip(!responseUrl, 'RESPONSE_URL is required for functional tests');
});

test.describe('Functional - Text Input', () => {
  test('accepts text input and retains the value', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const textFields = template.fields.filter(f => f.fieldType === 'text' || f.fieldType === 'text_long');
    test.skip(textFields.length === 0, 'No text fields in this template');

    for (const field of textFields) {
      await responsePage.testTextField(field, steps);
    }
  });
});

test.describe('Functional - Multiple Choice (Radio)', () => {
  test('selects a radio option and verifies it is checked', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const radioFields = template.fields.filter(f => f.fieldType === 'choice_single');
    test.skip(radioFields.length === 0, 'No multiple choice fields in this template');

    for (const field of radioFields) {
      await responsePage.testChoiceSingleField(field, steps);
    }
  });
});

test.describe('Functional - Checkboxes', () => {
  test('checks a checkbox and verifies it is selected', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const checkboxFields = template.fields.filter(f => f.fieldType === 'choice_multi');
    test.skip(checkboxFields.length === 0, 'No checkbox fields in this template');

    for (const field of checkboxFields) {
      await responsePage.testChoiceMultiField(field, steps);
    }
  });
});

test.describe('Functional - Dropdown', () => {
  test('opens dropdown and selects an option', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const dropdownFields = template.fields.filter(f => f.fieldType === 'choice_dropdown');
    test.skip(dropdownFields.length === 0, 'No dropdown fields in this template');

    for (const field of dropdownFields) {
      await responsePage.testDropdownField(field, steps);
    }
  });
});

test.describe('Functional - Date Picker', () => {
  test('fills a date and verifies the field is not empty', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const dateFields = template.fields.filter(f => f.fieldType === 'date');
    test.skip(dateFields.length === 0, 'No date fields in this template');

    for (const field of dateFields) {
      await responsePage.testDateField(field, steps);
    }
  });
});

test.describe('Functional - Rating (Stars)', () => {
  test('selects a star rating and verifies selection state', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const ratingFields = template.fields.filter(f => f.fieldType === 'rating');
    test.skip(ratingFields.length === 0, 'No rating fields in this template');

    for (const field of ratingFields) {
      await responsePage.testRatingField(field, steps);
    }
  });
});

test.describe('Functional - NPS Scale', () => {
  test('selects an NPS score', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const npsFields = template.fields.filter(f => f.fieldType === 'nps');
    test.skip(npsFields.length === 0, 'No NPS fields in this template');

    for (const field of npsFields) {
      await responsePage.testNpsField(field, steps);
    }
  });
});

test.describe('Functional - Likert Scale', () => {
  test('answers each Likert row and verifies radios are checked', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const likertFields = template.fields.filter(f => f.fieldType === 'likert');
    test.skip(likertFields.length === 0, 'No Likert fields in this template');

    for (const field of likertFields) {
      await responsePage.testLikertField(field, steps);
    }
  });
});

test.describe('Functional - Ranking', () => {
  test('reorders ranking items', async ({ responsePage, template, steps }) => {
    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to form response page');

    const rankingFields = template.fields.filter(f => f.fieldType === 'ranking');
    test.skip(rankingFields.length === 0, 'No ranking fields in this template');

    for (const field of rankingFields) {
      await responsePage.testRankingField(field, steps);
    }
  });
});
