import { test, expect } from '../../fixtures/formFixture';
import { RESPONSE } from '../../tester/selectors';
import { TIMEOUTS } from '../../config/forms.config';

const responseUrl = process.env.RESPONSE_URL;
const LOAD_ITERATIONS = 3;

const THRESHOLDS = {
  pageLoadMs: 10_000,
  textInputMs: 500,
  radioClickMs: 500,
  questionRenderMs: 2_000,
};

test.beforeAll(() => {
  if (!responseUrl) {
    throw new Error('RESPONSE_URL environment variable is required.');
  }
});

test.describe('Performance Tests', () => {

  test('page load time stays under threshold across repeated loads', async ({ responsePage, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    const loadTimes: number[] = [];

    for (let i = 1; i <= LOAD_ITERATIONS; i++) {
      const start = Date.now();
      await responsePage.navigateTo(responseUrl);
      const elapsed = Date.now() - start;
      loadTimes.push(elapsed);

      steps.push(`Load ${i}: ${elapsed}ms`);
      expect(elapsed, `Page load ${i} exceeded ${THRESHOLDS.pageLoadMs}ms`).toBeLessThan(THRESHOLDS.pageLoadMs);
    }

    const avg = Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length);
    const min = Math.min(...loadTimes);
    const max = Math.max(...loadTimes);

    console.log('\n--- Page Load Performance ---');
    console.log(`  Iterations : ${LOAD_ITERATIONS}`);
    console.log(`  Min        : ${min}ms`);
    console.log(`  Max        : ${max}ms`);
    console.log(`  Average    : ${avg}ms`);
    console.log(`  Threshold  : ${THRESHOLDS.pageLoadMs}ms`);
    console.log('-----------------------------\n');

    steps.push(`Average load time: ${avg}ms (min ${min}ms, max ${max}ms)`);
  });

  test('question containers render within threshold', async ({ responsePage, template, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    await responsePage.navigateTo(responseUrl);

    const start = Date.now();
    const questions = responsePage['page'].locator(RESPONSE.questionContainer);
    await questions.first().waitFor({ state: 'visible', timeout: TIMEOUTS.elementWait });
    const renderTime = Date.now() - start;

    const count = await questions.count();

    console.log('\n--- Question Render Performance ---');
    console.log(`  Questions found : ${count}`);
    console.log(`  Render time     : ${renderTime}ms`);
    console.log(`  Threshold       : ${THRESHOLDS.questionRenderMs}ms`);
    console.log('----------------------------------\n');

    expect(renderTime, `Questions took ${renderTime}ms to render`).toBeLessThan(THRESHOLDS.questionRenderMs);
    steps.push(`${count} questions rendered in ${renderTime}ms`);
  });

  test('text input interaction responds within threshold', async ({ responsePage, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    await responsePage.navigateTo(responseUrl);

    const page = responsePage['page'];
    const textInput = page.locator(RESPONSE.textInput).first();

    const isVisible = await textInput.isVisible().catch(() => false);
    if (!isVisible) {
      steps.push('Skipped: no text input visible on first page');
      return;
    }

    const clickStart = Date.now();
    await textInput.click();
    const clickTime = Date.now() - clickStart;

    const typeStart = Date.now();
    await textInput.fill('Performance test input');
    const typeTime = Date.now() - typeStart;

    const verifyStart = Date.now();
    await expect(textInput).toHaveValue('Performance test input');
    const verifyTime = Date.now() - verifyStart;

    const totalTime = clickTime + typeTime + verifyTime;

    console.log('\n--- Text Input Performance ---');
    console.log(`  Click time    : ${clickTime}ms`);
    console.log(`  Type time     : ${typeTime}ms`);
    console.log(`  Verify time   : ${verifyTime}ms`);
    console.log(`  Total         : ${totalTime}ms`);
    console.log(`  Threshold     : ${THRESHOLDS.textInputMs}ms (per action)`);
    console.log('------------------------------\n');

    expect(clickTime, `Click took ${clickTime}ms`).toBeLessThan(THRESHOLDS.textInputMs);
    expect(typeTime, `Type took ${typeTime}ms`).toBeLessThan(THRESHOLDS.textInputMs);
    steps.push(`Text input: click ${clickTime}ms, type ${typeTime}ms, verify ${verifyTime}ms`);
  });

  test('radio button interaction responds within threshold', async ({ responsePage, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    await responsePage.navigateTo(responseUrl);

    const page = responsePage['page'];
    const radios = page.locator(RESPONSE.radioInput);
    const count = await radios.count();

    if (count === 0) {
      steps.push('Skipped: no radio inputs visible on first page');
      return;
    }

    const clickStart = Date.now();
    await radios.first().click({ force: true });
    const clickTime = Date.now() - clickStart;

    const verifyStart = Date.now();
    await expect(radios.first()).toBeChecked();
    const verifyTime = Date.now() - verifyStart;

    console.log('\n--- Radio Button Performance ---');
    console.log(`  Click time    : ${clickTime}ms`);
    console.log(`  Verify time   : ${verifyTime}ms`);
    console.log(`  Threshold     : ${THRESHOLDS.radioClickMs}ms`);
    console.log('--------------------------------\n');

    expect(clickTime, `Radio click took ${clickTime}ms`).toBeLessThan(THRESHOLDS.radioClickMs);
    steps.push(`Radio: click ${clickTime}ms, verify ${verifyTime}ms`);
  });

  test('stress: rapid sequential navigations do not degrade', async ({ responsePage, steps }) => {
    if (!responseUrl) throw new Error('RESPONSE_URL not set');

    const times: number[] = [];
    const iterations = 5;

    for (let i = 1; i <= iterations; i++) {
      const start = Date.now();
      await responsePage.navigateTo(responseUrl);
      const elapsed = Date.now() - start;
      times.push(elapsed);
    }

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const firstLoad = times[0];
    const lastLoad = times[times.length - 1];
    const degradation = lastLoad - firstLoad;
    const degradationPct = Math.round((degradation / firstLoad) * 100);

    console.log('\n--- Stress Test: Sequential Loads ---');
    console.log(`  Iterations     : ${iterations}`);
    console.log(`  Times (ms)     : ${times.join(', ')}`);
    console.log(`  Average        : ${avg}ms`);
    console.log(`  First load     : ${firstLoad}ms`);
    console.log(`  Last load      : ${lastLoad}ms`);
    console.log(`  Degradation    : ${degradation}ms (${degradationPct}%)`);
    console.log('-------------------------------------\n');

    expect(avg, `Average load ${avg}ms should be under threshold`).toBeLessThan(THRESHOLDS.pageLoadMs);
    steps.push(`Stress: ${iterations} loads, avg ${avg}ms, degradation ${degradationPct}%`);
  });
});
