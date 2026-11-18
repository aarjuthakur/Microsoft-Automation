import { test, expect } from '../../fixtures/formFixture';
test.describe('E2E - Happy Path', () => {
  let responseUrl: string;

  test('create form from CSV template', async ({ editorPage, template, steps }) => {
    await editorPage.navigateAndWaitForLogin();
    steps.push('Navigated to MS Forms and logged in');

    await editorPage.createNewForm(template.title);
    steps.push(`Created new form: "${template.title}"`);

    await editorPage.addAllQuestions(template);
    steps.push(`Added ${template.fields.length} questions from CSV template`);

    responseUrl = await editorPage.getResponseUrl();
    expect(responseUrl, 'Response URL should be generated').toBeTruthy();
    steps.push(`Extracted response URL: ${responseUrl}`);
  });

  test('fill all fields with test data and verify each input', async ({ responsePage, template, steps }) => {
    expect(responseUrl, 'Response URL must exist from build step').toBeTruthy();

    await responsePage.navigateTo(responseUrl);
    steps.push('Navigated to the form response page');

    await responsePage.verifyFormLoaded(template.title);
    steps.push('Verified form loaded with heading visible');

    await responsePage.testAllFields(template.fields, steps);
    steps.push(`Tested ${template.fields.length} fields with assertions`);

    await responsePage.submitForm(steps);
    steps.push('Form submitted and confirmation verified');
  });

});
