import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, isAbsolute } from 'path';
import { execSync } from 'child_process';
import { validateFormCsv } from '../csv/csvValidator';
import { parseFormCsv } from '../csv/csvParser';

const SAMPLES_DIR = join(process.cwd(), 'samples');
const GENERATED_FORMS_DIR = join(process.cwd(), 'generated-forms');

function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    isError,
  };
}

export function handleListCsvTemplates() {
  if (!existsSync(SAMPLES_DIR)) {
    return textResult('No samples/ directory found.', true);
  }

  const files = readdirSync(SAMPLES_DIR).filter(f => f.endsWith('.csv'));
  const templates = files.map(filename => {
    const filePath = join(SAMPLES_DIR, filename);
    try {
      const template = parseFormCsv(filePath);
      const hasBranching = template.branchPlan.branchRules.length > 0;
      return {
        filename,
        title: template.title,
        fields: template.fields.length,
        sections: template.branchPlan.orderedSections.length,
        branchRules: template.branchPlan.branchRules.length,
        hasBranching,
      };
    } catch {
      return { filename, title: '(parse error)', fields: 0, sections: 0, branchRules: 0, hasBranching: false };
    }
  });

  return textResult(JSON.stringify(templates, null, 2));
}

export function handleValidateCsv(args: { filePath: string }) {
  const filePath = isAbsolute(args.filePath) ? args.filePath : join(SAMPLES_DIR, args.filePath);

  if (!existsSync(filePath)) {
    return textResult(`File not found: ${filePath}`, true);
  }

  const result = validateFormCsv(filePath);
  return textResult(JSON.stringify(result, null, 2));
}

export function handleCreateForm(args: { csvPath: string }) {
  const csvPath = isAbsolute(args.csvPath) ? args.csvPath : join(SAMPLES_DIR, args.csvPath);

  if (!existsSync(csvPath)) {
    return textResult(`CSV file not found: ${csvPath}`, true);
  }

  try {
    const output = execSync(
      `npx playwright test tests/buildOnly.spec.ts`,
      {
        cwd: process.cwd(),
        env: { ...process.env, CSV_FILE: csvPath },
        timeout: 600_000,
        encoding: 'utf-8',
      },
    );
    return textResult(`Form creation completed.\n\n${output}`);
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = error.stdout || error.stderr || error.message || 'Unknown error';
    return textResult(`Form creation failed:\n${output}`, true);
  }
}

export function handleTestForm(args: { responseUrl: string }) {
  if (!args.responseUrl) {
    return textResult('responseUrl is required.', true);
  }

  try {
    const output = execSync(
      `npx playwright test tests/testExisting.spec.ts`,
      {
        cwd: process.cwd(),
        env: { ...process.env, RESPONSE_URL: args.responseUrl },
        timeout: 300_000,
        encoding: 'utf-8',
      },
    );
    return textResult(`Tests passed.\n\n${output}`);
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = error.stdout || error.stderr || error.message || 'Unknown error';
    return textResult(`Tests failed:\n${output}`, true);
  }
}

export function handleGetFormLinks() {
  const logPath = join(GENERATED_FORMS_DIR, 'forms-log.json');

  if (!existsSync(logPath)) {
    return textResult('No generated forms found. Run create_form first.');
  }

  try {
    const content = readFileSync(logPath, 'utf-8');
    return textResult(content);
  } catch {
    return textResult('Could not read forms-log.json.', true);
  }
}

export function handleGetTestReport() {
  const reportDir = join(process.cwd(), 'test-results');

  if (!existsSync(reportDir)) {
    return textResult('No test-results directory found. Run tests first.');
  }

  try {
    const files = readdirSync(reportDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      const allFiles = files.join(', ');
      return textResult(`test-results/ contains: ${allFiles}\nNo JSON report files found. Run tests with --reporter=json to generate a report.`);
    }

    const latestFile = jsonFiles.sort().pop()!;
    const content = readFileSync(join(reportDir, latestFile), 'utf-8');
    const report = JSON.parse(content);

    const summary = {
      file: latestFile,
      suites: report.suites?.length ?? 0,
      tests: report.stats?.expected ?? 0,
      passed: report.stats?.expected ?? 0,
      failed: report.stats?.unexpected ?? 0,
      skipped: report.stats?.skipped ?? 0,
      duration: report.stats?.duration ?? 0,
    };

    return textResult(JSON.stringify(summary, null, 2));
  } catch {
    return textResult('Could not parse test report.', true);
  }
}
