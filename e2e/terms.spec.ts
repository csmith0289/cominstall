import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./accounts";
import { openUsersAsAdmin, sendInvitation, uniqueEmail } from "./invitations";
import { linkInEmail } from "./outbox";

test("the sign-in page and the footer link to the terms of use and privacy notice, each marked DRAFT", async ({ page }) => {
  await page.goto("/sign-in");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
  await expect(footer.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");

  await page.getByRole("main").getByRole("link", { name: "terms of use" }).click();
  await expect(page.getByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByRole("note")).toContainText("DRAFT");

  await page.goto("/sign-in");
  await page.getByRole("main").getByRole("link", { name: "privacy notice" }).click();
  await expect(page.getByRole("heading", { name: "Privacy notice", level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByRole("note")).toContainText("DRAFT");
});

test("a new Engineer must accept the terms before anything else, and isn't asked again", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const email = uniqueEmail("terms");
  await sendInvitation(page, email, "Engineer");
  const context = await browser.newContext();
  const engineer = await context.newPage();
  await engineer.goto(await linkInEmail(email, /invited to Com-Install Job Cards/));
  await engineer.getByLabel("Your name").fill("Terms Engineer");
  await engineer.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await engineer.getByRole("button", { name: "Create account" }).click();

  const accept = engineer.getByRole("heading", { name: "Accept the terms of use" });
  await expect(accept).toBeVisible();
  await expect(engineer.getByRole("banner").getByRole("link", { name: "My Jobs" })).toHaveCount(0);
  const main = engineer.getByRole("main");
  await expect(main.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
  await expect(main.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");

  // Every other page sends them back here until they accept.
  for (const path of ["/jobs", "/", "/admin/users"]) {
    await engineer.goto(path);
    await expect(accept).toBeVisible();
  }
  // The terms themselves stay readable.
  await engineer.goto("/terms");
  await expect(engineer.getByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();

  await engineer.goto("/accept-terms");
  await engineer.getByLabel("I have read and accept the terms of use").check();
  await engineer.getByRole("button", { name: "Accept and continue" }).click();
  await expect(engineer.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  // The header gets its links back straight away, without a reload.
  await expect(engineer.getByRole("banner").getByRole("link", { name: "My Jobs" })).toBeVisible();

  // Accepted once: not asked again, after a reload or on signing in again.
  await engineer.reload();
  await expect(engineer.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await engineer.goto("/accept-terms");
  await expect(engineer.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await engineer.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await engineer.getByLabel("Email").fill(email);
  await engineer.getByLabel("Password").fill(E2E_PASSWORD);
  await engineer.getByRole("button", { name: "Sign in" }).click();
  await expect(engineer.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await expect(engineer.getByRole("contentinfo").getByRole("link", { name: "Privacy notice" })).toBeVisible();
  await context.close();
});
