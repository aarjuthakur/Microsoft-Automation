import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { FIELD_TYPE_MAP } from '../config/forms.config';

export interface CsvValidationError {
  row?: number;
  message: string;
}

export interface CsvValidationResult {
  valid: boolean;
  errors: CsvValidationError[];
}

const EXPECTED_HEADERS = [
  'Page', 'Section Title', 'Form Type', 'Validation',
  'Question', 'Required', 'Options', 'Branch Condition',
];

const BRANCH_REGEX = /^(.+?)\s*(>=|<=|>|<|==|!=|=)\s*(.+)$/;
const QUESTION_LABEL_REGEX = /^[A-Za-z][A-Za-z0-9\s\-_'().?!,/]+$/;
const OPTIONS_FORMAT_REGEX = /^[^;|]+(;[^;|]+|[|][^;|]+)*$/;
const VALIDATION_FORMAT_REGEX = /^(Min|Max)\s+\d+\s+chars$|^Valid\s+\w+$|^\d+-\d+(\s+(stars|scale))?$/i;
const EMAIL_TYPE_REGEX = /email/i;
const PHONE_TYPE_REGEX = /phone/i;

export function validateFormCsv(filePath: string): CsvValidationResult {
  const errors: CsvValidationError[] = [];

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return { valid: false, errors: [{ message: 'Could not read file. Check the file path.' }] };
  }

  if (!content.trim()) {
    return { valid: false, errors: [{ message: 'CSV file is empty.' }] };
  }

  let rows: string[][];
  try {
    rows = parse(content, { relax_column_count: true, skip_empty_lines: false });
  } catch {
    return { valid: false, errors: [{ message: 'Could not parse file as CSV. Check the file format.' }] };
  }

  if (rows.length < 3) {
    errors.push({
      message: `CSV must have at least 3 rows (title row, header row, data row). Found ${rows.length} row(s).`,
    });
    return { valid: false, errors };
  }

  // Row 0: "Form Title,<title>"
  if (!rows[0][0] || rows[0][0].trim().toLowerCase() !== 'form title') {
    errors.push({
      row: 1,
      message: `Row 1 must start with "Form Title" in column A. Found: "${rows[0][0] || '(empty)'}".`,
    });
  }
  if (!rows[0][1] || !rows[0][1].trim()) {
    errors.push({
      row: 1,
      message: 'Row 1 column B must contain the form title. It is empty.',
    });
  }

  // Row 1: headers
  const headers = rows[1].map(h => h.trim().toLowerCase());
  const expectedLower = EXPECTED_HEADERS.map(h => h.toLowerCase());
  for (let i = 0; i < expectedLower.length; i++) {
    if (!headers[i] || headers[i] !== expectedLower[i]) {
      errors.push({
        row: 2,
        message: `Header column ${i + 1} should be "${EXPECTED_HEADERS[i]}" but found "${rows[1][i]?.trim() || '(missing)'}".`,
      });
    }
  }

  // Data rows
  let dataRowCount = 0;
  let lastPage = 0;
  const questionSlugs = new Set<string>();

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row[0]?.trim()) continue;
    dataRowCount++;

    const pageStr = row[0].trim();
    const page = parseInt(pageStr, 10);
    if (isNaN(page) || page < 1) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Page must be a positive number. Found: "${pageStr}".`,
      });
    } else if (page < lastPage) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Page ${page} appears after page ${lastPage}. Pages must be in order.`,
      });
    } else {
      lastPage = page;
    }

    const sectionTitle = row.length > 1 ? row[1]?.trim() : '';
    if (!sectionTitle) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Section Title (column B) is required.`,
      });
    }

    const rawType = row.length > 2 ? row[2]?.trim() : '';
    if (!rawType) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Form Type (column C) is required.`,
      });
    } else if (!FIELD_TYPE_MAP[rawType.toLowerCase()]) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Unknown form type "${rawType}". Valid types: ${Object.keys(FIELD_TYPE_MAP).join(', ')}.`,
      });
    }

    const label = row.length > 4 ? row[4]?.trim() : '';
    if (!label) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Question (column E) is required.`,
      });
    } else {
      const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '');
      questionSlugs.add(slug);
    }

    const requiredVal = row.length > 5 ? row[5]?.trim().toLowerCase() : '';
    if (requiredVal && requiredVal !== 'yes' && requiredVal !== 'no' && requiredVal !== '') {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: Required column should be "Yes", "No", or empty. Found: "${row[5]?.trim()}".`,
      });
    }

    const branchExpr = row.length > 7 ? row[7]?.trim() : '';
    if (branchExpr) {
      const match = branchExpr.match(BRANCH_REGEX);
      if (!match) {
        errors.push({
          row: i + 1,
          message: `Row ${i + 1}: Invalid branch condition "${branchExpr}". Expected format: "question_slug>=value" or "question_slug=value".`,
        });
      }
    }

    validateFieldPatterns(row, i + 1, errors);
  }

  if (dataRowCount === 0) {
    errors.push({ message: 'No question rows found. Add at least one question starting from row 3.' });
  }

  return { valid: errors.length === 0, errors };
}

function validateFieldPatterns(
  row: string[],
  displayRow: number,
  errors: CsvValidationError[],
): void {
  const rawType = row.length > 2 ? row[2]?.trim() || '' : '';
  const validation = row.length > 3 ? row[3]?.trim() || '' : '';
  const label = row.length > 4 ? row[4]?.trim() || '' : '';
  const options = row.length > 6 ? row[6]?.trim() || '' : '';

  if (label && (EMAIL_TYPE_REGEX.test(rawType) || PHONE_TYPE_REGEX.test(rawType))) {
    if (!QUESTION_LABEL_REGEX.test(label)) {
      errors.push({
        row: displayRow,
        message: `Row ${displayRow}: Question label "${label}" contains invalid characters. Labels should start with a letter and use only letters, numbers, spaces, and basic punctuation.`,
      });
    }
  }

  if (options && !OPTIONS_FORMAT_REGEX.test(options)) {
    errors.push({
      row: displayRow,
      message: `Row ${displayRow}: Options "${options}" has invalid format. Use semicolons or pipes to separate options with no empty segments.`,
    });
  }

  if (validation && !VALIDATION_FORMAT_REGEX.test(validation)) {
    errors.push({
      row: displayRow,
      message: `Row ${displayRow}: Validation "${validation}" does not match a known pattern (e.g., "Min 3 chars", "Max 10 chars", "Valid email", "1-5 stars").`,
    });
  }
}
