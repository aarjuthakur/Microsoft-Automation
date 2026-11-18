import { test, expect } from '../fixtures/formFixture';

test('create form from CSV and print response URL', async ({ editorPage, template }) => {
  await editorPage.navigateAndWaitForLogin();
  await editorPage.createNewForm(template.title);
  await editorPage.addAllQuestions(template);

  const responseUrl = await editorPage.getResponseUrl();
  expect(responseUrl).toBeTruthy();

  console.log('\n========================================');
  console.log(`Form: ${template.title}`);
  console.log(`Fields: ${template.fields.length}`);
  console.log(`Response URL: ${responseUrl}`);
  console.log('========================================\n');
});
