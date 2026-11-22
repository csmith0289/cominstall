// Job Cards. Every function that reads or changes a Job Card for an Engineer takes the Engineer's id from the
// session and is scoped to it: an Engineer never reaches another Engineer's Job Card, whatever id they send.

import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { customers, jobCardParts, jobCards, vehicles } from "@/db/schema";
import { displayReg } from "@/vehicles/reg";
import {
  MAX_MILEAGE_DIGITS,
  MAX_PART,
  MAX_PART_NUMBER_OR_NOTES,
  MAX_PART_ROWS,
  MAX_QUANTITY,
  MAX_WORK_CARRIED_OUT,
  type JobCardChanges,
  type JobCardView,
  type PartRow,
} from "./rules";

export * from "./rules";

export type Result = { ok: true } | { error: string };

// Today in the UK, as yyyy-mm-dd, whatever the server's time zone.
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// A new Draft dated today, owned by the signed-in Engineer.
export async function createDraft(db: Database, { engineerId, now = new Date() }: { engineerId: string; now?: Date }): Promise<string> {
  const [created] = await db.insert(jobCards).values({ engineerId, jobDate: ukToday(now), status: "draft" }).returning({ id: jobCards.id });
  return created!.id;
}

export async function jobCardForEngineer(db: Database, { id, engineerId }: { id: string; engineerId: string }): Promise<JobCardView | null> {
  const [row] = await db
    .select({
      id: jobCards.id,
      status: jobCards.status,
      jobDate: jobCards.jobDate,
      mileage: jobCards.mileage,
      workCarriedOut: jobCards.workCarriedOut,
      vehicleId: vehicles.id,
      reg: vehicles.reg,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(jobCards)
    .leftJoin(vehicles, eq(vehicles.id, jobCards.vehicleId))
    .leftJoin(customers, eq(customers.id, jobCards.customerId))
    .where(and(eq(jobCards.id, id), eq(jobCards.engineerId, engineerId)));
  if (!row) return null;
  const parts = await db
    .select({ quantity: jobCardParts.quantity, part: jobCardParts.part, partNumberOrNotes: jobCardParts.partNumberOrNotes })
    .from(jobCardParts)
    .where(eq(jobCardParts.jobCardId, id))
    .orderBy(asc(jobCardParts.position));
  return {
    id: row.id,
    status: row.status,
    jobDate: row.jobDate,
    mileage: row.mileage,
    workCarriedOut: row.workCarriedOut,
    vehicle: row.vehicleId && row.reg ? { id: row.vehicleId, reg: displayReg(row.reg) } : null,
    customer: row.customerId && row.customerName !== null ? { id: row.customerId, name: row.customerName } : null,
    parts,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// Checks what the browser sent. Anything not listed here (an engineer id, a Status) is ignored.
export function parseChanges(input: unknown): JobCardChanges | { error: string } {
  if (!isRecord(input)) return { error: "Nothing to save." };
  const { jobDate, vehicleId, mileage, workCarriedOut, parts } = input;
  if (typeof jobDate !== "string" || !isIsoDate(jobDate)) return { error: "Enter the Date." };
  if (vehicleId !== null && (typeof vehicleId !== "string" || !vehicleId)) return { error: "Choose the Reg again." };
  if (mileage !== null && (typeof mileage !== "number" || !Number.isInteger(mileage) || mileage < 0 || String(mileage).length > MAX_MILEAGE_DIGITS)) {
    return { error: "Mileage must be a whole number." };
  }
  if (typeof workCarriedOut !== "string") return { error: "Nothing to save." };
  if (workCarriedOut.length > MAX_WORK_CARRIED_OUT) return { error: `Keep Work Carried Out under ${MAX_WORK_CARRIED_OUT} characters.` };
  if (!Array.isArray(parts) || parts.length > MAX_PART_ROWS) return { error: `A Job Card can have up to ${MAX_PART_ROWS} Parts Used.` };
  const rows: PartRow[] = [];
  for (const row of parts) {
    if (!isRecord(row)) return { error: "Nothing to save." };
    const { quantity, part, partNumberOrNotes } = row;
    if (typeof quantity !== "string" || typeof part !== "string" || typeof partNumberOrNotes !== "string") return { error: "Nothing to save." };
    if (quantity.length > MAX_QUANTITY) return { error: `Keep each quantity under ${MAX_QUANTITY} characters.` };
    if (part.length > MAX_PART) return { error: `Keep each part under ${MAX_PART} characters.` };
    if (partNumberOrNotes.length > MAX_PART_NUMBER_OR_NOTES) return { error: `Keep each part number or note under ${MAX_PART_NUMBER_OR_NOTES} characters.` };
    rows.push({ quantity, part, partNumberOrNotes });
  }
  return { jobDate, vehicleId, mileage, workCarriedOut, parts: rows };
}

const NOT_FOUND = "This Job Card can't be found. Go back to My Jobs.";

// Saves the whole card. Only the owning Engineer can, and only while it isn't Complete. Choosing a Vehicle also
// stores its Customer at the time, so a Vehicle changing hands later doesn't rewrite this Job Card.
export async function saveJobCard(db: Database, { id, engineerId, changes: input }: { id: string; engineerId: string; changes: unknown }): Promise<Result> {
  const changes = parseChanges(input);
  if ("error" in changes) return changes;
  return db.transaction(async (tx) => {
    const [card] = await tx
      .select({ status: jobCards.status, vehicleId: jobCards.vehicleId })
      .from(jobCards)
      .where(and(eq(jobCards.id, id), eq(jobCards.engineerId, engineerId)))
      .for("update");
    if (!card) return { error: NOT_FOUND };
    if (card.status === "complete") return { error: "This Job Card is Complete, so it can't be changed." };

    let vehicleChange = {};
    if (changes.vehicleId !== card.vehicleId) {
      if (changes.vehicleId === null) {
        vehicleChange = { vehicleId: null, customerId: null };
      } else {
        const [vehicle] = await tx.select({ id: vehicles.id, customerId: vehicles.customerId }).from(vehicles).where(eq(vehicles.id, changes.vehicleId));
        if (!vehicle) return { error: "That Vehicle no longer exists. Type the Reg again." };
        vehicleChange = { vehicleId: vehicle.id, customerId: vehicle.customerId };
      }
    }

    await tx
      .update(jobCards)
      .set({ jobDate: changes.jobDate, mileage: changes.mileage, workCarriedOut: changes.workCarriedOut, ...vehicleChange })
      .where(eq(jobCards.id, id));
    // Rows left empty aren't kept.
    const filled = changes.parts.filter((row) => row.quantity.trim() || row.part.trim() || row.partNumberOrNotes.trim());
    await tx.delete(jobCardParts).where(eq(jobCardParts.jobCardId, id));
    if (filled.length) await tx.insert(jobCardParts).values(filled.map((row, position) => ({ jobCardId: id, position, ...row })));
    return { ok: true } as const;
  });
}
