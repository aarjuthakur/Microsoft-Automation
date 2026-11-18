import type {
  FormField, BranchCondition, BranchRule, BranchRoute,
  BranchPlan, FormSection, ComparisonOperator,
} from '../models/types';

const BRANCH_REGEX = /^(.+?)\s*(>=|<=|>|<|==|!=|=)\s*(.+)$/;

export function resolveBranches(fields: FormField[]): BranchPlan {
  const orderedSections = buildOrderedSections(fields);
  const branchRules = extractBranchRules(orderedSections, fields);
  return { orderedSections, branchRules };
}

function buildOrderedSections(fields: FormField[]): FormSection[] {
  const sectionMap = new Map<string, FormSection>();
  const sectionOrder: string[] = [];

  for (const field of fields) {
    const key = `${field.page}::${field.sectionTitle}`;

    if (!sectionMap.has(key)) {
      const condition = field.branchExpression
        ? parseBranchExpression(field.branchExpression)
        : null;

      sectionMap.set(key, {
        page: field.page,
        title: field.sectionTitle,
        fields: [],
        condition,
      });
      sectionOrder.push(key);
    }

    sectionMap.get(key)!.fields.push(field);
  }

  return sectionOrder.map(key => sectionMap.get(key)!);
}

function extractBranchRules(sections: FormSection[], allFields: FormField[]): BranchRule[] {
  const rules: BranchRule[] = [];
  const processedTriggers = new Set<string>();

  for (const section of sections) {
    if (!section.condition) continue;

    const triggerSlug = section.condition.triggerQuestionLabel;
    if (processedTriggers.has(triggerSlug)) continue;

    const triggerField = findTriggerField(triggerSlug, allFields);
    if (!triggerField) {
      console.log(`Branch warning: trigger question '${triggerSlug}' not found in form fields.`);
      continue;
    }

    const routes: BranchRoute[] = [];
    for (const s of sections) {
      if (!s.condition) continue;
      if (s.condition.triggerQuestionLabel !== triggerSlug) continue;
      routes.push({
        condition: s.condition,
        targetSectionTitle: s.title,
      });
    }

    if (routes.length > 0) {
      rules.push({
        triggerQuestionLabel: triggerField.label,
        triggerFieldType: triggerField.fieldType,
        routes,
      });
      processedTriggers.add(triggerSlug);
    }
  }

  return rules;
}

function findTriggerField(slug: string, allFields: FormField[]): FormField | null {
  const normalized = slug.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const field of allFields) {
    const fieldSlug = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fieldSlug === normalized) return field;
  }

  for (const field of allFields) {
    const fieldSlug = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fieldSlug.includes(normalized) || normalized.includes(fieldSlug)) return field;
  }

  return null;
}

function parseBranchExpression(expression: string): BranchCondition | null {
  const match = expression.match(BRANCH_REGEX);
  if (!match) return null;

  let [, keyword, operator, value] = match;
  if (operator === '=') operator = '==';

  return {
    triggerQuestionLabel: keyword.trim(),
    operator: operator as ComparisonOperator,
    value: value.trim(),
    rawExpression: expression,
  };
}
