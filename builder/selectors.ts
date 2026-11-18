export const EDITOR = {
  // Dashboard
  newFormButton: "button[data-automation-id='newFormButton']",
  newFormButtonAria: "xpath=//button[contains(@aria-label, 'Create a new form')]",
  newFormButtonText: "xpath=//*[contains(text(), 'New Form')]",

  // Overlays
  dismissBtn: "xpath=//button[contains(@aria-label, 'Dismiss')]",
  closeBtn: "xpath=//button[contains(@aria-label, 'Close')]",
  gotItBtn: "xpath=//button[contains(@aria-label, 'Got it')]",
  overlay: '.ms-Overlay',

  // Form title
  formTitleDiv: "xpath=//div[contains(@aria-label, 'Form title')]",
  formTitleContentEditable: "xpath=//div[contains(@aria-label, 'Form title') and @contenteditable='true'] | //div[@role='textbox' and contains(@aria-label, 'Form title')]",
  untitledFormDiv: "xpath=//div[contains(text(), 'Untitled form')]",
  untitledDiv: "xpath=//div[contains(text(), 'Untitled')]",
  formDescriptionDiv: "xpath=//div[contains(@aria-label, 'Form description') or contains(@aria-label, 'form subtitle')]",

  // Question palette
  addNewQuestionBtn: "xpath=//button[contains(@aria-label, 'Add new question') or contains(@aria-label, 'Insert new question')]",
  addNewQuestionText: "xpath=//button[contains(text(), 'Add new question') or contains(text(), 'Insert new question')]",
  paletteVisible: "xpath=//button[@aria-label='Text' or @aria-label='Choice']",
  quickStartBtn: "xpath=//button[contains(@aria-label, 'Quick start')]",

  // Question editing
  questionTitleTextbox: "xpath=//div[@role='textbox' and contains(@aria-label, 'Question title')]",
  requiredToggle: "div[role='switch'][aria-label='Required']",
  multipleAnswersToggle: "div[role='switch'][aria-label='Multiple answers']",
  longAnswerToggle: "div[role='switch'][aria-label='Long answer']",

  // "More options" button (renders as <DIV role="button">, not <button>)
  moreOptionsBtn: "[role='button'][aria-label*='More settings for question']",
  moreOptionsBtnFallback: "xpath=//*[@role='button' and contains(., 'More options')]",

  // Subtitle (from the "More options" menu)
  subtitleMenuItem: "[role='menuitemcheckbox'][aria-label='Subtitle']",
  subtitleTextbox: "xpath=//div[@role='textbox' and contains(@aria-label, 'Subtitle')]",
  subtitleInput: "xpath=//input[contains(@aria-label, 'Subtitle')]",
  subtitleTextarea: "xpath=//textarea[contains(@aria-label, 'Subtitle')]",

  // Choice options
  choiceOptionTextbox: "xpath=//div[@role='textbox' and contains(@aria-label, 'Choice Option Text')]",
  addOptionBtn: "xpath=//button[@aria-label='Add option']",
  rankingOptionTextbox: "xpath=//div[@role='textbox' and contains(@aria-label, 'Option')]",

  // Restrictions (validation) — from "More options" menu
  restrictionsMenuItem: "[role='menuitemcheckbox'][aria-label='Restrictions']",
  // Restriction controls: two dropdowns (type + condition) and a value input.
  // Defaults show "Number" / "Is number" with placeholder "The value must be a number".
  restrictionTypeDropdown: "[role='button'][aria-haspopup='listbox'][aria-label*='Number']",
  restrictionConditionDropdown: "[role='button'][aria-haspopup='listbox'][aria-label*='number']",
  restrictionValueInput: "input[placeholder*='value']",

  // Collect responses
  collectResponsesBtn: "xpath=//button[@aria-label='Collect responses']",
  responseLinkInput: "xpath=//input[contains(@value, 'forms.') or contains(@aria-label, 'link') or contains(@aria-label, 'Link')]",
  responseLinkAnchor: "xpath=//a[contains(@href, 'forms.')]",

  // Branching UI — "Add branching" is a menuitemcheckbox in the "More options" menu
  branchingMenuItem: "[role='menuitemcheckbox'][aria-label='Add branching']",
  goToDropdown: "[role='button'][aria-label='Next ']",
  goToDropdownAlt: "[role='button'][aria-label*='Next']",
  branchingDoneBtn: "xpath=//button[contains(@aria-label, 'Done') or contains(text(), 'Done')]",
  endOfFormOption: "xpath=//*[@role='option' and (contains(text(), 'End of the form') or contains(text(), 'End of form') or contains(text(), 'Submit form'))]",
} as const;

export function goToOption(sectionTitle: string): string {
  return `xpath=//*[@role='option' and contains(text(), '${sectionTitle}')] | //option[contains(text(), '${sectionTitle}')]`;
}

export function questionCardByLabel(label: string): string {
  return `xpath=//div[contains(@aria-label, '${label}')] | //*[contains(@data-automation-id, 'questionItem') and .//*[contains(text(), '${label}')]]`;
}

export function questionTypeButton(label: string): string {
  return `xpath=//button[@aria-label='${label}']`;
}

export function questionTypeButtonContains(label: string): string {
  return `xpath=//button[contains(@aria-label, '${label}')]`;
}

export function questionTypeButtonText(label: string): string {
  return `xpath=//button[normalize-space(text())='${label}']`;
}

export function questionTypeButtonContainsText(label: string): string {
  return `xpath=//button[contains(normalize-space(.), '${label}')]`;
}
