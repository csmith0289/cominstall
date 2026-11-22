import { expect, type Page } from "@playwright/test";
import { E2E_PASSWORD, invitingAdminEmail } from "./accounts";
import { confirmEmail } from "./outbox";

// Each run of the suite shares one outbox folder, so every invitee gets an address of its own.
export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.cominstall.test`;

// Signs up as this project's inviting Admin the first time (from ADMIN_EMAILS, then confirms the email), signs in
// after that, and opens Admin → Users.
export async function openUsersAsAdmin(page: Page, project: string) {
  const email = invitingAdminEmail(project);
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Inviting Admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  const myJobs = page.getByRole("heading", { name: "My Jobs" });
  const alreadyExists = page.getByRole("main").getByRole("alert").filter({ hasText: "already exists" });
  await expect(myJobs.or(alreadyExists)).toBeVisible();
  if (await alreadyExists.isVisible()) {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(myJobs).toBeVisible();
  } else {
    await confirmEmail(page, email);
  }
  await page.goto("/admin");
  await page.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
}

export async function sendInvitation(page: Page, email: string, role: "Engineer" | "Admin" = "Engineer") {
  const form = page.getByRole("form", { name: "Invite a User" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Role").selectOption({ label: role });
  await form.getByRole("button", { name: "Send invitation" }).click();
}
