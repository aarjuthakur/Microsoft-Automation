import type { FieldTypeKey } from '../models/types';

export const FORMS_URL = 'https://forms.cloud.microsoft';

export const TIMEOUTS = {
  loginWait: 120_000,
  elementWait: 15_000,
  shortWait: 5_000,
  afterClick: 1_000,
  afterType: 500,
  betweenQuestions: 2_000,
  slowTypeDelay: 30,
} as const;

export const BROWSER_PROFILE_DIR = (() => {
  const localAppData = process.env.LOCALAPPDATA || '';
  return `${localAppData}\\ms_forms_automation\\browser_profile`;
})();

export const FIELD_TYPE_MAP: Record<string, FieldTypeKey> = {
  'text (short answer)': 'text',
  'email input': 'text',
  'number input': 'text',
  'time picker': 'text',
  'paragraph text (long)': 'text_long',
  'multiple choice': 'choice_single',
  'checkboxes': 'choice_multi',
  'dropdown list': 'choice_dropdown',
  'date picker': 'date',
  'rating scale (stars)': 'rating',
  'ranking/ordering': 'ranking',
  'likert scale': 'likert',
  'nps scale': 'nps',
  'file upload': 'file_upload',
  'name': 'text',
  'email': 'text',
  'phone': 'text',
  'website': 'text',
  'address': 'text_long',
  'multi-line': 'text_long',
  'dropdown': 'choice_dropdown',
  'radio': 'choice_single',
  'checkbox': 'choice_multi',
  'date': 'date',
  'rating': 'rating',
};

export const QUESTION_TYPE_BUTTONS: Record<string, string> = {
  text: 'Text',
  choice: 'Choice',
  date: 'Date',
  rating: 'Rating',
  ranking: 'Ranking',
  likert: 'Likert',
  file_upload: 'Upload File',
  nps: 'Net Promoter Score',
  section: 'Section',
};
