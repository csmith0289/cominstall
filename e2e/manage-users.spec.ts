import { expect, test } from "@playwright/test";
import { E2E_OPERATOR_EMAIL } from "./accounts";
import { openUsersAsAdmin } from "./invitations";
import { inviteEngineer, signIn, userRow } from "./manage-users";

test("an Admin sees each User's Role, whether they're active, and their last sign-in", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const engineer = await inviteEngineer(page, browser, "listed");
  await page.reload();

  const row = userRow(page, engineer.name);
  await expect(row).toContainText(engineer.email);
  await expect(row).toContainText("Engineer · Active");
  await expect(row).toContainText(/Last sign-in: \d{1,2} [A-Z][a-z]{2} \d{4}/);
  await expect(row).toContainText("0 Job Cards");
  await expect(page.getByRole("main")).not.toContainText(E2E_OPERATOR_EMAIL);
  // Their own row can't deactivate them.
  await expect(page.getByRole("listitem").filter({ hasText: "(you)" }).getByRole("button", { name: /^Deactivate/ })).toHaveCount(0);
  await engineer.context.close();
});

test("an Admin makes an Engineer an Admin and back, and the change takes effect", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const engineer = await inviteEngineer(page, browser, "promoted");
  await page.reload();
  const row = userRow(page, engineer.name);

  await row.getByLabel(`Role for ${engineer.name}`, { exact: true }).selectOption({ label: "Admin" });
  await row.getByRole("button", { name: `Save Role for ${engineer.name}` }).click();
  await expect(row.getByRole("status")).toHaveText(`${engineer.name} is now an Admin.`);
  await expect(row).toContainText("Admin · Active");
  await engineer.page.reload();
  await expect(engineer.page.getByRole("banner").getByRole("link", { name: "Admin" })).toBeVisible();

  await row.getByLabel(`Role for ${engineer.name}`, { exact: true }).selectOption({ label: "Engineer" });
  await row.getByRole("button", { name: `Save Role for ${engineer.name}` }).click();
  await expect(row.getByRole("status")).toHaveText(`${engineer.name} is now an Engineer.`);
  await engineer.page.goto("/admin/users");
  await expect(engineer.page.getByRole("heading", { name: "Users", exact: true })).toHaveCount(0);
  await engineer.context.close();
});

test("deactivating signs the User out at once and stops them signing in; reactivating lets them back", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const engineer = await inviteEngineer(page, browser, "leaver");
  await page.reload();
  const row = userRow(page, engineer.name);

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Deactivate ${engineer.name}` }).click();
  await expect(row.getByRole("status")).toHaveText(`${engineer.name} is deactivated and signed out everywhere.`);
  await expect(row).toContainText("Engineer · Deactivated");

  // Their open page no longer works.
  await engineer.page.goto("/jobs");
  await expect(engineer.page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await signIn(engineer.page, engineer.email);
  await expect(engineer.page.getByRole("main").getByRole("alert")).toContainText("Your account has been turned off");

  await row.getByRole("button", { name: `Reactivate ${engineer.name}` }).click();
  await expect(row.getByRole("status")).toHaveText(`${engineer.name} can sign in again.`);
  await expect(row).toContainText("Engineer · Active");
  await signIn(engineer.page, engineer.email);
  await expect(engineer.page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await engineer.context.close();
});

test("dismissing the Deactivate question changes nothing", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const engineer = await inviteEngineer(page, browser, "stays");
  await page.reload();
  const row = userRow(page, engineer.name);
  page.once("dialog", (dialog) => dialog.dismiss());
  await row.getByRole("button", { name: `Deactivate ${engineer.name}` }).click();
  await page.reload();
  await expect(userRow(page, engineer.name)).toContainText("Engineer · Active");
  await engineer.page.reload();
  await expect(engineer.page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await engineer.context.close();
});
