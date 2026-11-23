import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./accounts";
import { sendInvitation, uniqueEmail } from "./invitations";
import { linkInEmail } from "./outbox";
import { acceptTerms } from "./terms";

// The Admin (already on Admin → Users) invites an Engineer, who accepts in a browser of their own and lands on My Jobs.
// Names are invented and made unique, so each run finds its own row.
export async function inviteEngineer(adminPage: Page, browser: Browser, label: string, contextOptions: BrowserContextOptions = {}) {
  const email = uniqueEmail(label);
  const name = `Test Engineer ${email.split("@")[0]!.split("-").slice(-2).join("")}`;
  await sendInvitation(adminPage, email, "Engineer");
  const link = await linkInEmail(email, /invited to Com-Install Job Cards/);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(link);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await acceptTerms(page);
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  return { email, name, context, page };
}

// The row for one User on Admin → Users.
export const userRow = (adminPage: Page, name: string) => adminPage.getByRole("listitem", { name, exact: true });

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
