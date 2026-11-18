import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { FIELD_TYPE_MAP } from '../config/forms.config';
import { resolveBranches } from './branchResolver';
import type { FormField, FieldTypeKey, FormTemplate } from '../models/types';

const WHITESPACE_COLLAPSE_REGEX = /\s+/g;
const LEADING_TRAILING_REGEX = /^\s+|\s+$/g;

function normalizeLabel(raw: string): string {
  return raw.replace(LEADING_TRAILING_REGEX, '').replace(WHITESPACE_COLLAPSE_REGEX, ' ');
}

export function parseFormCsv(filePath: string): FormTemplate {
  const content = readFileSync(filePath, 'utf-8');
  const rows: string[][] = parse(content, {
    relax_column_count: true,
    skip_empty_lines: false,
  });

  let title = 'Untitled Form';
  if (rows.length > 0 && rows[0].length > 1 && rows[0][1]?.trim()) {
    title = rows[0][1].trim();
  }

  const fields: FormField[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row[0]?.trim()) continue;

    const page = parseInt(row[0].trim(), 10);
    if (isNaN(page)) continue;

    const sectionTitle = row.length > 1 ? row[1]?.trim() || '' : '';
    const rawType = row.length > 2 ? row[2]?.trim() || '' : '';
    const validation = row.length > 3 && row[3]?.trim() ? row[3].trim() : null;
    const label = row.length > 4 ? normalizeLabel(row[4] || '') : '';
    const required = row.length > 5 && row[5]?.trim().toLowerCase() === 'yes';
    const optionsRaw = row.length > 6 ? row[6]?.trim() || '' : '';
    const branchExpression = row.length > 7 && row[7]?.trim() ? row[7].trim() : null;

    const fieldType = resolveFieldType(rawType);
    const options = optionsRaw
      ? optionsRaw.split('|').map(o => o.trim()).filter(o => o.length > 0)
      : [];

    fields.push({
      label,
      rawType,
      fieldType,
      required,
      options,
      validation,
      branchExpression,
      page,
      sectionTitle,
    });
  }

  const branchPlan = resolveBranches(fields);

  return { title, fields, branchPlan };
}

function resolveFieldType(rawType: string): FieldTypeKey {
  const key = rawType.toLowerCase();
  return FIELD_TYPE_MAP[key] || 'text';
}
