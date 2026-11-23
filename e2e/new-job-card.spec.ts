import { expect, test } from "@playwright/test";
import { addNewVehicleAndCustomer, inventedReg, saveState, signUpNewEngineer, startNewJobCard, ukToday } from "./job-cards";

// Invented firms and Regs, never real ones.

test("an Engineer starts a Draft, adds a new Vehicle and Customer, fills it in, and it's all saved", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Desk Engineer");
  await startNewJobCard(page);
  const main = page.getByRole("main");

  // A Draft dated today, with six Parts Used rows to start.
  await expect(page.getByRole("form", { name: "Job Card" })).toContainText("Draft");
  await expect(page.getByLabel("Date")).toHaveValue(ukToday());
  await expect(main.getByRole("textbox", { name: /^Part, row/ })).toHaveCount(6);
  await expect(saveState(page)).toHaveText("Saved");

  const reg = inventedReg();
  await addNewVehicleAndCustomer(page, reg, { name: "Imaginary Couriers Ltd", phone: "01632 960123", email: "office@imaginary.test" });

  // Mileage is a whole number: anything else typed is dropped.
  await page.getByLabel("Mileage").fill("");
  await page.getByLabel("Mileage").pressSequentially("12a3.4");
  await expect(page.getByLabel("Mileage")).toHaveValue("1234");
  await page.getByRole("textbox", { name: "Work Carried Out" }).fill("Fitted a tracker.\nChecked the wiring.\nAll tested OK.");
  await page.getByLabel("Quantity, row 1").fill("1");
  await page.getByLabel("Part, row 1").fill("Tracker unit");
  await page.getByLabel("Part number or notes, row 1").fill("TRK-100");
  await page.getByRole("button", { name: "+ Add another row" }).click();
  await expect(main.getByRole("textbox", { name: /^Part, row/ })).toHaveCount(7);
  await expect(page.getByLabel("Quantity, row 7")).toBeFocused();
  await page.getByLabel("Quantity, row 7").fill("4");
  await page.getByLabel("Part, row 7").fill("Cable tie");

  // Saved within 2 seconds of typing stopping.
  await expect(saveState(page)).toHaveText("Saved", { timeout: 2_000 });

  await page.reload();
  await expect(page.getByLabel("Reg", { exact: true })).toHaveValue(reg.shown);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("Imaginary Couriers Ltd");
  await expect(page.getByLabel("Mileage")).toHaveValue("1234");
  await expect(page.getByRole("textbox", { name: "Work Carried Out" })).toHaveValue("Fitted a tracker.\nChecked the wiring.\nAll tested OK.");
  await expect(page.getByLabel("Part, row 1")).toHaveValue("Tracker unit");
  await expect(page.getByLabel("Part number or notes, row 1")).toHaveValue("TRK-100");
  // The empty rows between aren't kept, so the second Part Used moves up.
  await expect(page.getByLabel("Part, row 2")).toHaveValue("Cable tie");
  await expect(page.getByLabel("Quantity, row 2")).toHaveValue("4");
  await expect(main.getByRole("textbox", { name: /^Part, row/ })).toHaveCount(6);
});

test("typing a Reg however it's written suggests the Vehicle, and choosing it fills in the Customer", async ({ page, browser }, testInfo) => {
  // One Engineer adds the Vehicle.
  await signUpNewEngineer(page, browser, testInfo.project.name, "First Engineer");
  await startNewJobCard(page);
  const reg = inventedReg();
  await addNewVehicleAndCustomer(page, reg, { name: "Pretend Plant Hire", phone: "", email: "" });
  await expect(saveState(page)).toHaveText("Saved");

  // A second Engineer types it in lower case with a space.
  const other = await browser.newContext();
  const second = await other.newPage();
  await signUpNewEngineer(second, browser, testInfo.project.name, "Second Engineer");
  await startNewJobCard(second);
  await second.getByLabel("Reg", { exact: true }).fill(`${reg.stored.slice(0, 4).toLowerCase()} ${reg.stored.slice(4).toLowerCase()}`);
  const suggestions = second.getByRole("list", { name: "Matching Vehicles" });
  await expect(suggestions.getByRole("button")).toHaveText([`${reg.shown} · Pretend Plant Hire`]);
  // A known Reg isn't offered as a new Vehicle.
  await expect(second.getByRole("button", { name: /^Add new Vehicle/i })).toHaveCount(0);
  await suggestions.getByRole("button", { name: reg.shown }).click();
  await expect(second.getByLabel("Reg", { exact: true })).toHaveValue(reg.shown);
  await expect(second.getByLabel("Customer", { exact: true })).toHaveValue("Pretend Plant Hire");
  await expect(saveState(second)).toHaveText("Saved");
  await second.reload();
  await expect(second.getByLabel("Customer", { exact: true })).toHaveValue("Pretend Plant Hire");

  // The second Engineer can't open the first Engineer's Job Card.
  const response = await second.goto(page.url());
  expect(response?.status()).toBe(404);
  await other.close();
});

test("with no signal the Job Card says it isn't saved, then saves when the signal comes back", async ({ page, browser, context }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Rural Engineer");
  await startNewJobCard(page);
  const work = page.getByRole("textbox", { name: "Work Carried Out" });

  await context.setOffline(true);
  await work.fill("Typed in a dead spot.");
  await expect(saveState(page)).toHaveText("Not saved – no signal");

  await context.setOffline(false);
  await expect(saveState(page)).toHaveText("Saved");
  await page.reload();
  await expect(work).toHaveValue("Typed in a dead spot.");
});

test("a Job Card sends anyone signed out to the sign-in page", async ({ page }) => {
  await page.goto("/jobs/any-id");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
