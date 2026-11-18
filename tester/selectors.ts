export const RESPONSE = {
  questionContainer: '[data-automation-id="questionItem"]',
  questionTitle: '[data-automation-id="questionTitle"]',
  textInput: '[data-automation-id="textInput"]',
  radioInput: 'input[type=radio]',
  checkboxInput: 'input[type=checkbox]',
  dropdownTrigger: '[role=combobox], select, [aria-haspopup=listbox], [aria-haspopup=true], [aria-haspopup]',
  dropdownOption: '[role=option]',
  dateInput: 'input[role=combobox]',
  rankingOption: '[role=option]',
  nextButton: 'button[data-automation-id="nextButton"]',
  previousButton: 'button[data-automation-id="previousButton"]',
  submitButton: 'button[data-automation-id="submitButton"]',
  errorAlert: '[role=alert]',
  thankYouText: 'Your response was submitted.',
  startButton: 'button:has-text("Start")',
} as const;

export function starRating(n: number): string {
  return `[aria-label="${n} Star"]`;
}
