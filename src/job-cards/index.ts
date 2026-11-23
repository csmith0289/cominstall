// Job Cards. Every function that reads or changes a Job Card for an Engineer takes the Engineer's id from the
// session and is scoped to it: an Engineer never reaches another Engineer's Job Card, whatever id they send.

import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { customers, jobCardParts, jobCards, vehicles } from "@/db/schema";
import { displayReg } from "@/vehicles/reg";
import {
  isEmptyPartRow,
  MAX_MILEAGE,
  MAX_PART,
  MAX_PART_NUMBER_OR_NOTES,
  MAX_PART_ROWS,
  MAX_SENT_PART_ROWS,
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

// Checks what the browser sent. Each field is optional: one left out isn't changed. Anything not listed here (an
// engineer id, a Status) is ignored. Empty Parts Used rows are dropped, so they never count towards the limit.
export function parseChanges(input: unknown): JobCardChanges | { error: string } {
  if (!isRecord(input)) return { error: "Nothing to save." };
  const { jobDate, vehicleId, mileage, workCarriedOut, parts } = input;
  const changes: JobCardChanges = {};
  if (jobDate !== undefined) {
    if (typeof jobDate !== "string" || !isIsoDate(jobDate)) return { error: "Enter the Date." };
    changes.jobDate = jobDate;
  }
  if (vehicleId !== undefined) {
    if (vehicleId !== null && (typeof vehicleId !== "string" || !vehicleId)) return { error: "Choose the Reg again." };
    changes.vehicleId = vehicleId;
  }
  if (mileage !== undefined) {
    if (mileage !== null && (typeof mileage !== "number" || !Number.isSafeInteger(mileage) || mileage < 0 || mileage > MAX_MILEAGE)) {
      return { error: "Mileage must be a whole number." };
    }
    changes.mileage = mileage;
  }
  if (workCarriedOut !== undefined) {
    if (typeof workCarriedOut !== "string") return { error: "Nothing to save." };
    if (workCarriedOut.length > MAX_WORK_CARRIED_OUT) return { error: `Keep Work Carried Out under ${MAX_WORK_CARRIED_OUT} characters.` };
    changes.workCarriedOut = workCarriedOut;
  }
  if (parts !== undefined) {
    const tooMany = { error: `A Job Card can have up to ${MAX_PART_ROWS} Parts Used.` };
    if (!Array.isArray(parts)) return { error: "Nothing to save." };
    if (parts.length > MAX_SENT_PART_ROWS) return tooMany;
    const rows: PartRow[] = [];
    for (const row of parts) {
      if (!isRecord(row)) return { error: "Nothing to save." };
      const { quantity, part, partNumberOrNotes } = row;
      if (typeof quantity !== "string" || typeof part !== "string" || typeof partNumberOrNotes !== "string") return { error: "Nothing to save." };
      if (quantity.length > MAX_QUANTITY) return { error: `Keep each quantity under ${MAX_QUANTITY} characters.` };
      if (part.length > MAX_PART) return { error: `Keep each part under ${MAX_PART} characters.` };
      if (partNumberOrNotes.length > MAX_PART_NUMBER_OR_NOTES) return { error: `Keep each part number or note under ${MAX_PART_NUMBER_OR_NOTES} characters.` };
      const kept = { quantity, part, partNumberOrNotes };
      if (!isEmptyPartRow(kept)) rows.push(kept);
    }
    if (rows.length > MAX_PART_ROWS) return tooMany;
    changes.parts = rows;
  }
  return changes;
}

const NOT_FOUND = "This Job Card can't be found. Go back to My Jobs.";

// Saves the fields sent, and leaves the rest as they are. Only the owning Engineer can, and only while it isn't
// Complete. Choosing a Vehicle also stores its Customer at the time, so a Vehicle changing hands later doesn't rewrite
// this Job Card.
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

    const { jobDate, mileage, workCarriedOut, vehicleId, parts } = changes;
    const set: Partial<typeof jobCards.$inferInsert> = {};
    if (jobDate !== undefined) set.jobDate = jobDate;
    if (mileage !== undefined) set.mileage = mileage;
    if (workCarriedOut !== undefined) set.workCarriedOut = workCarriedOut;
    if (vehicleId !== undefined && vehicleId !== card.vehicleId) {
      if (vehicleId === null) {
        Object.assign(set, { vehicleId: null, customerId: null });
      } else {
        const [vehicle] = await tx.select({ id: vehicles.id, customerId: vehicles.customerId }).from(vehicles).where(eq(vehicles.id, vehicleId));
        if (!vehicle) return { error: "That Vehicle no longer exists. Type the Reg again." };
        Object.assign(set, { vehicleId: vehicle.id, customerId: vehicle.customerId });
      }
    }

    if (Object.keys(set).length) await tx.update(jobCards).set(set).where(eq(jobCards.id, id));
    if (parts !== undefined) {
      await tx.delete(jobCardParts).where(eq(jobCardParts.jobCardId, id));
      if (parts.length) await tx.insert(jobCardParts).values(parts.map((row, position) => ({ jobCardId: id, position, ...row })));
    }
    return { ok: true } as const;
  });
}
