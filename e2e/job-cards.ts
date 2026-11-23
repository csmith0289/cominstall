import { expect, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./accounts";
import { openUsersAsAdmin, sendInvitation, uniqueEmail } from "./invitations";
import { linkInEmail } from "./outbox";

// A new Engineer, invited by this project's Admin (in a context of its own), who accepts on `page` and lands on My Jobs.
export async function signUpNewEngineer(page: Page, browser: Browser, project: string, name: string) {
  const email = uniqueEmail(`engineer-${project}`);
  const desk = await browser.newContext();
  const adminPage = await desk.newPage();
  await openUsersAsAdmin(adminPage, project);
  await sendInvitation(adminPage, email, "Engineer");
  await expect(adminPage.getByRole("main").getByRole("status")).toContainText(`Invited ${email}`);
  await desk.close();

  await page.goto(await linkInEmail(email, /invited to Com-Install Job Cards/));
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "My Jobs" })).toBeVisible();
  return email;
}

// A made-up current-style Reg, different on every run (the e2e database is shared by every test in the run).
// It starts with Z, which no real current-style Reg does, so it can never be someone's vehicle.
export function inventedReg(): { stored: string; shown: string } {
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const stored = `Z${letter()}${Math.floor(10 + Math.random() * 90)}${letter()}${letter()}${letter()}`;
  return { stored, shown: `${stored.slice(0, 4)} ${stored.slice(4)}` };
}

// Today in the UK, as the Date field holds it.
export const ukToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function startNewJobCard(page: Page) {
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New Job Card" }).click();
  await expect(page.getByRole("heading", { name: "Job Card", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
}

export const saveState = (page: Page) => page.getByRole("main").getByRole("status");

// Adds the Reg as a new Vehicle with a new Customer, from the Job Card.
export async function addNewVehicleAndCustomer(
  page: Page,
  reg: { stored: string; shown: string },
  customer: { name: string; phone: string; email: string },
) {
  await page.getByLabel("Reg", { exact: true }).fill(reg.stored.toLowerCase());
  await page.getByRole("button", { name: `Add new Vehicle ${reg.shown}`, exact: true }).click();
  const panel = page.getByRole("region", { name: `New Vehicle ${reg.shown}`, exact: true });
  await expect(panel.getByRole("heading", { name: `New Vehicle ${reg.shown}`, exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Add new Customer", exact: true }).click();
  const form = panel.getByRole("group", { name: "New Customer", exact: true });
  await expect(form.getByRole("heading", { name: "New Customer", exact: true })).toBeVisible();
  await form.getByLabel("Name").fill(customer.name);
  await form.getByLabel("Phone").fill(customer.phone);
  await form.getByLabel("Email").fill(customer.email);
  await form.getByRole("button", { name: "Save Customer", exact: true }).click();
  await expect(panel).toContainText(`Customer: ${customer.name}`);
  await panel.getByRole("button", { name: "Add Vehicle", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByLabel("Reg", { exact: true })).toHaveValue(reg.shown);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(customer.name);
}
