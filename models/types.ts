export type FieldTypeKey =
  | 'text' | 'text_long'
  | 'choice_single' | 'choice_multi' | 'choice_dropdown'
  | 'date' | 'rating' | 'ranking' | 'likert' | 'nps'
  | 'file_upload';

export type ComparisonOperator = '>=' | '<=' | '>' | '<' | '==' | '!=';

export interface FormField {
  label: string;
  rawType: string;
  fieldType: FieldTypeKey;
  required: boolean;
  options: string[];
  validation: string | null;
  branchExpression: string | null;
  page: number;
  sectionTitle: string;
}

export interface BranchCondition {
  triggerQuestionLabel: string;
  operator: ComparisonOperator;
  value: string;
  rawExpression: string;
}

export interface BranchRoute {
  condition: BranchCondition;
  targetSectionTitle: string;
}

export interface BranchRule {
  triggerQuestionLabel: string;
  triggerFieldType: FieldTypeKey;
  routes: BranchRoute[];
}

export interface FormSection {
  page: number;
  title: string;
  fields: FormField[];
  condition: BranchCondition | null;
}

export interface BranchPlan {
  orderedSections: FormSection[];
  branchRules: BranchRule[];
}

export interface FormTemplate {
  title: string;
  fields: FormField[];
  branchPlan: BranchPlan;
}

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface TestResult {
  fieldLabel: string;
  fieldType: string;
  status: TestStatus;
  errorMessage: string | null;
}
