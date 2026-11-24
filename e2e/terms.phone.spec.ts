import { expect, test } from "@playwright/test";

const sidewaysOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [path, title] of [
  ["/terms", "Terms of use"],
  ["/privacy", "Privacy notice"],
] as const) {
  test(`${title} reads on a phone screen without sideways scrolling, with the footer in reach`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByRole("note")).toContainText("DRAFT");
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    const footerLink = page.getByRole("contentinfo").getByRole("link", { name: title });
    await footerLink.scrollIntoViewIfNeeded();
    await expect(footerLink).toBeInViewport();
  });
}
