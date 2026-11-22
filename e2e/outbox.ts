import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

// The test server has no Resend settings, so it writes each email here instead (playwright.config.ts).
export const E2E_OUTBOX_DIR = ".data/e2e-outbox";

type Email = { to: string; subject: string; text: string; sentAt: string };

async function emailsTo(to: string, subject: RegExp): Promise<Email[]> {
  const files = (await readdir(E2E_OUTBOX_DIR).catch(() => [])).filter((file) => file.endsWith(".json")).sort();
  const emails: Email[] = await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(E2E_OUTBOX_DIR, file), "utf8"))));
  return emails.filter((email) => email.to === to && subject.test(email.subject));
}

// Waits for the `count`th email to `to` whose subject matches, and returns the link in it.
export async function linkInEmail(to: string, subject: RegExp, count = 1): Promise<string> {
  let found: Email[] = [];
  await expect.poll(async () => (found = await emailsTo(to, subject)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(count);
  return found[count - 1]!.text.match(/https?:\/\/\S+/)![0];
}

export async function countEmails(to: string, subject: RegExp): Promise<number> {
  return (await emailsTo(to, subject)).length;
}

// Opens the "Confirm your email" link, as the user would from their inbox, then goes back to the home page.
export async function confirmEmail(page: Page, email: string) {
  await page.goto(await linkInEmail(email, /Confirm your email/));
  await expect(page.getByRole("heading", { name: "Email address confirmed" })).toBeVisible();
  await page.goto("/");
}
