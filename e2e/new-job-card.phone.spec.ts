import { expect, test } from "@playwright/test";
import { addNewVehicleAndCustomer, inventedReg, saveState, signUpNewEngineer, startNewJobCard, ukToday } from "./job-cards";

// Invented firms and Regs, never real ones.
test("an Engineer fills in a new Job Card on a phone-sized screen", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Phone Engineer");
  await startNewJobCard(page);
  await expect(page.getByLabel("Date")).toHaveValue(ukToday());
  await expect(page.getByRole("main").getByRole("textbox", { name: /^Part, row/ })).toHaveCount(6);

  const reg = inventedReg();
  await addNewVehicleAndCustomer(page, reg, { name: "Fictional Fleet Services", phone: "07000 000000", email: "" });
  await page.getByLabel("Mileage").fill("88000");
  await page.getByRole("textbox", { name: "Work Carried Out" }).fill("Replaced the camera.");
  await page.getByLabel("Quantity, row 1").fill("1");
  await page.getByLabel("Part, row 1").fill("Reversing camera");
  await page.getByRole("button", { name: "+ Add another row" }).click();
  await expect(page.getByRole("main").getByRole("textbox", { name: /^Part, row/ })).toHaveCount(7);
  await expect(saveState(page)).toHaveText("Saved", { timeout: 2_000 });

  // Nothing pushes the screen sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.reload();
  await expect(page.getByLabel("Reg", { exact: true })).toHaveValue(reg.shown);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("Fictional Fleet Services");
  await expect(page.getByLabel("Mileage")).toHaveValue("88000");
  await expect(page.getByLabel("Part, row 1")).toHaveValue("Reversing camera");
});
