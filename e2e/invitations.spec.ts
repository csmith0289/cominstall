import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, invitingAdminEmail } from "./accounts";
import { openUsersAsAdmin, sendInvitation, uniqueEmail } from "./invitations";
import { countEmails, linkInEmail } from "./outbox";

const INVITED = /invited to Com-Install Job Cards/;

test("an Admin can't invite an email that has an account or a pending Invitation", async ({ page }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const form = page.getByRole("form", { name: "Invite a User" });

  await sendInvitation(page, invitingAdminEmail(testInfo.project.name));
  await expect(form.getByRole("alert")).toContainText("already has an account");

  const invitee = uniqueEmail("twice");
  await sendInvitation(page, invitee);
  await expect(form.getByRole("status")).toContainText(`Invited ${invitee} as an Engineer`);
  await sendInvitation(page, invitee, "Admin");
  await expect(form.getByRole("alert")).toContainText("already has a pending Invitation");
  expect(await countEmails(invitee, INVITED)).toBe(1);
});

test("an Admin invites an Admin, resends the Invitation, and only the new link works", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const invitee = uniqueEmail("new-admin");
  await sendInvitation(page, invitee, "Admin");
  const firstLink = await linkInEmail(invitee, INVITED);

  await page.getByRole("button", { name: `Resend invitation to ${invitee}` }).click();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Invitation sent again" })).toBeVisible();
  const secondLink = await linkInEmail(invitee, INVITED, 2);
  expect(secondLink).not.toBe(firstLink);

  const invitee_ = await browser.newContext();
  const phone = await invitee_.newPage();
  await phone.goto(firstLink);
  await expect(phone.getByRole("heading", { name: "Invitation link not valid" })).toBeVisible();

  await phone.goto(secondLink);
  await expect(phone.getByRole("main")).toContainText("as an Admin");
  await phone.getByLabel("Your name").fill("New Admin");
  await phone.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await phone.getByRole("button", { name: "Create account" }).click();
  await expect(phone.getByRole("banner").getByRole("link", { name: "Admin" })).toBeVisible();
  await invitee_.close();
});

test("an Admin cancels an Invitation, and its link stops working", async ({ page }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const invitee = uniqueEmail("cancelled");
  await sendInvitation(page, invitee);
  const link = await linkInEmail(invitee, INVITED);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Cancel invitation to ${invitee}` }).click();
  await expect(page.getByRole("button", { name: `Cancel invitation to ${invitee}` })).toHaveCount(0);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Invitation link not valid" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("contact an Admin");
});

test("an invited email can't sign up on the sign-up page without the link", async ({ page }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const invitee = uniqueEmail("no-link");
  await sendInvitation(page, invitee);

  const stranger = await page.context().browser()!.newContext();
  const other = await stranger.newPage();
  await other.goto("/sign-up");
  await other.getByLabel("Your name").fill("Not The Invitee");
  await other.getByLabel("Email").fill(invitee);
  await other.getByLabel("Password").fill(E2E_PASSWORD);
  await other.getByRole("button", { name: "Create account" }).click();
  await expect(other.getByRole("main").getByRole("alert")).toContainText("open the link in your invitation email");
  await stranger.close();
});

test("Admin → Users sends anyone signed out to the sign-in page", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
