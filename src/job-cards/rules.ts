// Limits and shapes shared by the server and the Job Card form in the browser. No server-only imports here.

import type { JobCardStatus } from "@/db/schema";

// A new Job Card shows six empty Parts Used rows, like the paper card.
export const STARTING_PART_ROWS = 6;
// Filled-in rows a Job Card keeps. Empty rows on screen don't count.
export const MAX_PART_ROWS = 100;
// Rows, empty or not, the server will look at in one save.
export const MAX_SENT_PART_ROWS = 1000;
export const MAX_WORK_CARRIED_OUT = 20_000;
export const MAX_QUANTITY = 20;
export const MAX_PART = 200;
export const MAX_PART_NUMBER_OR_NOTES = 500;
// Seven digits: more than any vehicle's mileage, well inside a Postgres integer.
export const MAX_MILEAGE_DIGITS = 7;
export const MAX_MILEAGE = 9_999_999;

export const isEmptyPartRow = (row: PartRow) => !row.quantity.trim() && !row.part.trim() && !row.partNumberOrNotes.trim();

export type PartRow = { quantity: string; part: string; partNumberOrNotes: string };

export type JobCardView = {
  id: string;
  status: JobCardStatus;
  jobDate: string;
  mileage: number | null;
  workCarriedOut: string;
  vehicle: { id: string; reg: string } | null;
  customer: { id: string; name: string } | null;
  parts: PartRow[];
};

export type JobCardFields = {
  jobDate: string;
  vehicleId: string | null;
  mileage: number | null;
  workCarriedOut: string;
  parts: PartRow[];
};

// What the Job Card form sends on a save: only the fields edited since the last save. Fields left out aren't touched,
// so an old copy of the card (Back, or a second tab) can't wipe newer work in the fields it didn't edit.
export type JobCardChanges = Partial<JobCardFields>;
