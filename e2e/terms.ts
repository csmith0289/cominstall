import { expect, type Page } from "@playwright/test";

// A new account is asked to accept the terms of use before anything else. Ticks the box and accepts.
export async function acceptTerms(page: Page) {
  await expect(page.getByRole("heading", { name: "Accept the terms of use" })).toBeVisible();
  await page.getByLabel("I have read and accept the terms of use").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
}
