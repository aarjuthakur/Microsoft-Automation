import { test } from '../../fixtures/formFixture';

test.describe('Smoke - Form Loads', () => {

  test('form response page loads and displays the heading', async ({ responsePage, steps }) => {
    const responseUrl = process.env.RESPONSE_URL;
    test.skip(!responseUrl, 'RESPONSE_URL is required for smoke tests');

    await responsePage.navigateTo(responseUrl!);
    steps.push('Navigated to the form response URL');

    await responsePage.verifyFormLoaded('');
    steps.push('Verified form heading is visible');
  });

  test('all questions from CSV are present on the page', async ({ responsePage, template, steps }) => {
    const responseUrl = process.env.RESPONSE_URL;
    test.skip(!responseUrl, 'RESPONSE_URL is required for smoke tests');

    await responsePage.navigateTo(responseUrl!);
    steps.push(`Navigated to form: "${template.title}"`);

    const testableFields = template.fields.filter(f => f.fieldType !== 'file_upload');
    steps.push(`CSV template has ${template.fields.length} fields (${testableFields.length} testable)`);

    await responsePage.verifyQuestionCount(testableFields.length);
    steps.push('Verified question containers are present on the page');
  });
});
