import { devices, expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./accounts";
import { openUsersAsAdmin, sendInvitation, uniqueEmail } from "./invitations";
import { linkInEmail } from "./outbox";

test("the Admin invites an Engineer, who accepts from the email on a phone-sized screen", async ({ browser, page }, testInfo) => {
  const engineer = uniqueEmail(`engineer-${testInfo.project.name}`);

  // The Admin, at a desk.
  const desk = await browser.newContext({ ...devices["Desktop Chrome"] });
  const adminPage = await desk.newPage();
  await openUsersAsAdmin(adminPage, testInfo.project.name);
  await sendInvitation(adminPage, engineer, "Engineer");
  await expect(adminPage.getByRole("status")).toContainText("The invitation email goes out if email is set up");
  await expect(adminPage.getByRole("main")).not.toContainText("/invitation?token=");

  // The Engineer, on their phone, from the email.
  const link = await linkInEmail(engineer, /invited to Com-Install Job Cards/);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Set up your account" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("as an Engineer");
  await expect(page.getByRole("main")).toContainText(engineer);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByLabel("Your name").fill("Phone Engineer");
  await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Signed in as an Engineer, email already confirmed.
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Hello Phone Engineer");
  await expect(page.getByRole("banner").getByRole("link", { name: "Admin" })).toHaveCount(0);

  // The Admin sees the account, and the Invitation has gone from the pending list.
  await adminPage.reload();
  await expect(adminPage.getByRole("main")).toContainText("Phone Engineer");
  await expect(adminPage.getByRole("button", { name: `Resend invitation to ${engineer}` })).toHaveCount(0);
  await desk.close();

  // The link has been used.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Invitation link not valid" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("contact an Admin");
});
