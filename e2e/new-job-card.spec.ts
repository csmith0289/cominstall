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

// #21
test("going Back to a Job Card shows the latest copy, and the next edit doesn't wipe what was saved", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Back Button Engineer");
  await startNewJobCard(page);
  const work = page.getByRole("textbox", { name: "Work Carried Out" });
  await work.fill("Fitted new tail lift switch");
  await page.getByLabel("Mileage").fill("88000");
  await expect(saveState(page)).toHaveText("Saved");

  await page.getByRole("link", { name: "← My Jobs" }).click();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await page.goBack();
  await expect(work).toHaveValue("Fitted new tail lift switch");
  await expect(page.getByLabel("Mileage")).toHaveValue("88000");

  await page.getByLabel("Part, row 1").fill("Switch");
  await expect(saveState(page)).toHaveText("Saved");
  await page.reload();
  await expect(work).toHaveValue("Fitted new tail lift switch");
  await expect(page.getByLabel("Mileage")).toHaveValue("88000");
  await expect(page.getByLabel("Part, row 1")).toHaveValue("Switch");
});

// #23
test("two tabs on the same Job Card don't undo each other's edits to different fields", async ({ page, browser, context }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Two Tab Engineer");
  await startNewJobCard(page);
  const work = page.getByRole("textbox", { name: "Work Carried Out" });
  await work.fill("from tab A");
  await expect(saveState(page)).toHaveText("Saved");

  const tabB = await context.newPage();
  await tabB.goto(page.url());
  await expect(tabB.getByRole("textbox", { name: "Work Carried Out" })).toHaveValue("from tab A");

  await page.bringToFront();
  await work.fill("from tab A, edited again");
  await expect(saveState(page)).toHaveText("Saved");
  await tabB.getByLabel("Mileage").fill("777");
  await expect(saveState(tabB)).toHaveText("Saved");

  await tabB.reload();
  await expect(tabB.getByRole("textbox", { name: "Work Carried Out" })).toHaveValue("from tab A, edited again");
  await expect(tabB.getByLabel("Mileage")).toHaveValue("777");
  await tabB.close();
});

// #22
test("a Reg typed in full is chosen without tapping it, and a Reg that isn't a Vehicle says it isn't saved", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Typing Engineer");
  await startNewJobCard(page);
  const known = inventedReg();
  await addNewVehicleAndCustomer(page, known, { name: "Make Believe Removals", phone: "", email: "" });

  await startNewJobCard(page);
  const reg = page.getByLabel("Reg", { exact: true });
  await reg.fill(known.stored.toLowerCase());
  await expect(page.getByRole("list", { name: "Matching Vehicles" })).toBeVisible();
  await page.getByLabel("Mileage").fill("1200");
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("Make Believe Removals");
  await expect(saveState(page)).toHaveText("Saved");
  await page.reload();
  await expect(reg).toHaveValue(known.shown);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("Make Believe Removals");

  const unknown = inventedReg();
  await reg.fill(unknown.stored);
  await page.getByLabel("Mileage").fill("1300");
  await expect(page.getByText("Reg not saved – choose a matching Vehicle or add a new one.")).toBeVisible();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("");
});

// #24
test("double-clicking New Job Card makes one Draft", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Double Click Engineer");
  await page.goto("/jobs");
  // The first action sent from My Jobs is "New Job Card". A second press is queued, and goes out from the new page.
  let newJobCardAction: string | undefined;
  let creates = 0;
  page.on("request", (request) => {
    const action = request.headers()["next-action"];
    if (request.method() !== "POST" || !action) return;
    newJobCardAction ??= new URL(request.url()).pathname === "/jobs" ? action : undefined;
    if (action === newJobCardAction) creates += 1;
  });
  // Two presses before the page can react, as a quick double-tap gives.
  await page.getByRole("button", { name: "New Job Card" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("heading", { name: "Job Card", exact: true })).toBeVisible();
  // A second press would be queued behind the first, so give it time to go out.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
  expect(creates).toBe(1);

  // Back on My Jobs, the button works again.
  await page.goBack();
  await expect(page.getByRole("button", { name: "New Job Card" })).toBeEnabled();
});

// #25
test("Parts Used stops at 100 rows, and the card still saves", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Many Parts Engineer");
  await startNewJobCard(page);
  const addRow = page.getByRole("button", { name: "+ Add another row" });
  for (let rows = 6; rows < 100; rows += 1) await addRow.click();
  await expect(page.getByRole("main").getByRole("textbox", { name: /^Part, row/ })).toHaveCount(100);
  await expect(addRow).toBeDisabled();
  await expect(page.getByText("A Job Card can have up to 100 Parts Used.")).toBeVisible();

  await page.getByLabel("Part, row 100").fill("Last relay");
  await page.getByRole("textbox", { name: "Work Carried Out" }).fill("Lots of rows");
  await expect(saveState(page)).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Part, row 1")).toHaveValue("Last relay");
});

// #27
test("editing straight after Back still catches up with the latest copy, and nothing saved is overwritten", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Quick Tap Engineer");
  await startNewJobCard(page);
  const work = page.getByRole("textbox", { name: "Work Carried Out" });
  await work.fill("Replaced the rear marker lamp");
  await page.getByLabel("Mileage").fill("120500");
  await expect(saveState(page)).toHaveText("Saved");

  await page.getByRole("link", { name: "← My Jobs" }).click();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  // A slow signal: every request to the server takes a while, so the Engineer's edit goes in before the catch-up is back.
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"]) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fallback();
  });
  await page.goBack();
  await page.getByLabel("Part, row 1").fill("Lamp");
  await expect(work).toHaveValue("Replaced the rear marker lamp");
  await expect(page.getByLabel("Mileage")).toHaveValue("120500");
  await expect(page.getByLabel("Part, row 1")).toHaveValue("Lamp");
  await expect(saveState(page)).toHaveText("Saved");
  await page.unrouteAll({ behavior: "wait" });

  await page.reload();
  await expect(work).toHaveValue("Replaced the rear marker lamp");
  await expect(page.getByLabel("Mileage")).toHaveValue("120500");
  await expect(page.getByLabel("Part, row 1")).toHaveValue("Lamp");
});

// #27, with no signal
test("going Back with no signal catches up once the signal is back", async ({ page, browser, context }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Dead Spot Engineer");
  await startNewJobCard(page);
  const work = page.getByRole("textbox", { name: "Work Carried Out" });
  await work.fill("Swapped the reversing camera");
  await page.getByLabel("Mileage").fill("54321");
  await expect(saveState(page)).toHaveText("Saved");

  await page.getByRole("link", { name: "← My Jobs" }).click();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await context.setOffline(true);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Job Card", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await context.setOffline(false);
  await expect(work).toHaveValue("Swapped the reversing camera");
  await expect(page.getByLabel("Mileage")).toHaveValue("54321");
});

// #28
test("leaving the Job Card straight after typing still saves the last edit", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Hasty Engineer");
  await startNewJobCard(page);
  const url = page.url();
  const work = page.getByRole("textbox", { name: "Work Carried Out" });
  await work.fill("Checked brake lines");
  await expect(saveState(page)).toHaveText("Saved");

  // Through the browser's Back button (to My Jobs, where the card was opened from).
  await page.getByLabel("Mileage").fill("4321");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await page.goto(url);
  await expect(page.getByLabel("Mileage")).toHaveValue("4321");

  // Through the app's own link.
  await work.fill("Checked brake lines and topped up fluid");
  await page.getByRole("link", { name: "← My Jobs" }).click();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  await page.goto(url);
  await expect(work).toHaveValue("Checked brake lines and topped up fluid");
  await expect(page.getByLabel("Mileage")).toHaveValue("4321");
});

// #29
test("a save refused for an empty Date keeps the other edits, and they save once the Date is put back", async ({ page, browser }, testInfo) => {
  await signUpNewEngineer(page, browser, testInfo.project.name, "Dateless Engineer");
  await startNewJobCard(page);
  const work = page.getByRole("textbox", { name: "Work Carried Out" });
  await page.getByLabel("Date").fill("");
  await work.fill("Serviced the tachograph");
  await page.getByLabel("Mileage").fill("64000");
  await expect(saveState(page)).toHaveText("Not saved – Enter the Date.");

  await page.getByLabel("Date").fill("2026-11-20");
  await expect(saveState(page)).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Date")).toHaveValue("2026-11-20");
  await expect(work).toHaveValue("Serviced the tachograph");
  await expect(page.getByLabel("Mileage")).toHaveValue("64000");
});

test("a Job Card sends anyone signed out to the sign-in page", async ({ page }) => {
  await page.goto("/jobs/any-id");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
