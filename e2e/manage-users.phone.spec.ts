import { devices, expect, test } from "@playwright/test";
import { openUsersAsAdmin } from "./invitations";
import { inviteEngineer, userRow } from "./manage-users";

test("an Admin deactivates an Engineer from a phone-sized screen", async ({ page, browser }, testInfo) => {
  await openUsersAsAdmin(page, testInfo.project.name);
  const engineer = await inviteEngineer(page, browser, `phone-leaver-${testInfo.project.name}`, { ...devices["Desktop Chrome"] });
  await page.reload();
  const row = userRow(page, engineer.name);
  await expect(row).toContainText("Engineer · Active");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Deactivate ${engineer.name}` }).click();
  await expect(row.getByRole("status")).toHaveText(`${engineer.name} is deactivated and signed out everywhere.`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await engineer.page.goto("/jobs");
  await expect(engineer.page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await engineer.context.close();
});
