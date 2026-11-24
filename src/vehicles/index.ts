// Vehicles, found by Reg. Typing a Reg suggests Vehicles already seen (so nobody creates a duplicate), and an unknown
// Reg can be added with its Customer.

import { asc, eq, like } from "drizzle-orm";
import type { Database } from "@/db";
import { customers, vehicles } from "@/db/schema";
import { displayReg, normaliseReg } from "./reg";

export type VehicleChoice = {
  id: string;
  // Shown with the usual space.
  reg: string;
  customer: { id: string; name: string } | null;
};

// A Reg is at least 2 and at most 10 characters once normalised.
export const MIN_REG = 2;
export const MAX_REG = 10;

const choice = (row: { id: string; reg: string; customerId: string | null; customerName: string | null }): VehicleChoice => ({
  id: row.id,
  reg: displayReg(row.reg),
  customer: row.customerId && row.customerName !== null ? { id: row.customerId, name: row.customerName } : null,
});

const vehicleWithCustomer = (db: Database) =>
  db
    .select({ id: vehicles.id, reg: vehicles.reg, customerId: customers.id, customerName: customers.name })
    .from(vehicles)
    .leftJoin(customers, eq(customers.id, vehicles.customerId));

// Vehicles whose Reg starts with what was typed, however it was typed ("ab12 c" finds AB12CDE). An exact match comes
// first.
export async function suggestVehicles(db: Database, typed: string, limit = 8): Promise<VehicleChoice[]> {
  const reg = normaliseReg(typed).slice(0, MAX_REG);
  if (!reg) return [];
  // A normalised Reg is only A–Z and 0–9, so it can't hold a LIKE wildcard.
  const rows = await vehicleWithCustomer(db).where(like(vehicles.reg, `${reg}%`)).orderBy(asc(vehicles.reg)).limit(limit);
  return rows.map(choice);
}

export async function vehicleById(db: Database, id: string): Promise<VehicleChoice | null> {
  const [row] = await vehicleWithCustomer(db).where(eq(vehicles.id, id));
  return row ? choice(row) : null;
}

export async function addVehicle(
  db: Database,
  input: { reg: unknown; customerId: unknown },
): Promise<{ vehicle: VehicleChoice } | { error: string }> {
  const reg = typeof input.reg === "string" ? normaliseReg(input.reg) : "";
  if (reg.length < MIN_REG || reg.length > MAX_REG) return { error: `Enter a Reg of ${MIN_REG} to ${MAX_REG} letters and numbers.` };
  if (typeof input.customerId !== "string" || !input.customerId) return { error: "Choose the Customer, or add a new one." };
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId));
  if (!customer) return { error: "That Customer no longer exists. Choose another." };
  const [created] = await db.insert(vehicles).values({ reg, customerId: customer.id }).onConflictDoNothing().returning({ id: vehicles.id });
  if (!created) return { error: `${displayReg(reg)} is already a Vehicle. Choose it from the suggestions.` };
  return { vehicle: (await vehicleById(db, created.id))! };
}
