import { test, expect } from '../fixtures/formFixture';
const responseUrl = process.env.RESPONSE_URL;

test.beforeAll(() => {
  if (!responseUrl) {
    throw new Error('RESPONSE_URL environment variable is required. Set it to the form response URL.');
  }
});

test.describe('Test Existing Form', () => {

  test('form loads and displays questions', async ({ responsePage, template, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    await responsePage.navigateTo(responseUrl);
    steps.push(`Navigated to: ${responseUrl}`);

    await responsePage.verifyFormLoaded(template.title);
    steps.push('Verified form heading is visible');

    await responsePage.verifyQuestionCount(template.fields.length);
    steps.push(`Verified question containers present for ${template.fields.length} fields`);
  });

  test('fill all fields, submit, and verify confirmation', async ({ responsePage, template, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    await responsePage.navigateTo(responseUrl);
    steps.push('Navigated to form response page');

    await responsePage.testAllFields(template.fields, steps);
    steps.push(`Completed testing ${template.fields.length} fields`);

    await responsePage.submitForm(steps);
    steps.push('Form submitted and confirmation verified');
  });
});
