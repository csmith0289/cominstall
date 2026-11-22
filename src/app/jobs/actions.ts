"use server";

import { redirect } from "next/navigation";
import { addCustomer, findCustomers, type CustomerChoice } from "@/customers";
import { getDatabase } from "@/db";
import { createDraft, saveJobCard, type Result } from "@/job-cards";
import { addVehicle, suggestVehicles, type VehicleChoice } from "@/vehicles";
import { requireUser } from "../session";

// Every action takes the Engineer from the session. Nothing the browser sends can choose whose Job Card it is.

export async function newJobCard(): Promise<never> {
  const engineer = await requireUser();
  const id = await createDraft(await getDatabase(), { engineerId: engineer.id });
  redirect(`/jobs/${id}`);
}

export async function saveJobCardChanges(id: unknown, changes: unknown): Promise<Result> {
  const engineer = await requireUser();
  if (typeof id !== "string" || !id) return { error: "This Job Card can't be found. Go back to My Jobs." };
  return saveJobCard(await getDatabase(), { id, engineerId: engineer.id, changes });
}

export async function findVehicles(typed: unknown): Promise<VehicleChoice[]> {
  await requireUser();
  return typeof typed === "string" ? suggestVehicles(await getDatabase(), typed) : [];
}

export async function searchCustomers(typed: unknown): Promise<CustomerChoice[]> {
  await requireUser();
  return typeof typed === "string" ? findCustomers(await getDatabase(), typed) : [];
}

export async function addNewCustomer(input: { name: unknown; phone?: unknown; email?: unknown }) {
  await requireUser();
  return addCustomer(await getDatabase(), input ?? {});
}

export async function addNewVehicle(input: { reg: unknown; customerId: unknown }) {
  await requireUser();
  return addVehicle(await getDatabase(), input ?? {});
}
