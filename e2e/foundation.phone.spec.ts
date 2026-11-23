import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, phoneAdminEmail } from "./accounts";
import { acceptTerms } from "./terms";

async function sidewaysOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the sign-in page fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test("the signed-in header fits a phone screen, with every link in reach", async ({ page }, testInfo) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Phone Admin");
  await page.getByLabel("Email").fill(phoneAdminEmail(testInfo.project.name));
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await acceptTerms(page);
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();

  const header = page.getByRole("banner");
  await expect(header.getByRole("img", { name: "Com-Install" })).toBeVisible();
  await expect(header.getByText("Job Cards", { exact: true })).toBeVisible();
  for (const link of ["My Jobs", "Admin"]) await expect(header.getByRole("link", { name: link })).toBeInViewport();
  await expect(header.getByRole("button", { name: "Sign out" })).toBeInViewport();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

  await header.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
