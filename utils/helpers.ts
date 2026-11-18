import { expect, type Locator } from '@playwright/test';

export async function expectVisible(locator: Locator, msg: string): Promise<void> {
  await expect(locator, msg).toBeVisible();
}

export async function expectHidden(locator: Locator, msg: string): Promise<void> {
  await expect(locator, msg).toBeHidden();
}

export async function expectValue(locator: Locator, value: string, msg: string): Promise<void> {
  await expect(locator, msg).toHaveValue(value);
}

export async function expectChecked(locator: Locator, msg: string): Promise<void> {
  await expect(locator, msg).toBeChecked();
}

export async function expectText(locator: Locator, text: string | RegExp, msg: string): Promise<void> {
  await expect(locator, msg).toContainText(text);
}
