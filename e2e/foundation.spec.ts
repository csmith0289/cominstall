import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_PASSWORD } from "./accounts";
import { confirmEmail } from "./outbox";

test("an uninvited email can't create an account", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Stranger");
  await page.getByLabel("Email").fill("stranger@e2e.cominstall.test");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // Inside main: Next.js adds its own empty role="alert" route announcer to every page.
  await expect(page.getByRole("main").getByRole("alert")).toContainText("You need an invitation");
});

test("the first Admin signs up from ADMIN_EMAILS and sees the Admin area", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Admin Person");
  await page.getByLabel("Email").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await confirmEmail(page, E2E_ADMIN_EMAIL);
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
});

test("every page asks search engines to keep out", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
});
