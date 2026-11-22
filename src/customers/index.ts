// Customers: the business or person a Vehicle belongs to. An Engineer can find one, or add one from a Job Card when
// a new Vehicle turns up.

import { asc, ilike } from "drizzle-orm";
import type { Database } from "@/db";
import { customers } from "@/db/schema";

export type Customer = typeof customers.$inferSelect;
export type CustomerChoice = { id: string; name: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_CUSTOMER_NAME = 200;
export const MAX_PHONE = 40;
export const MAX_EMAIL = 254;

// Escapes LIKE's wildcards, so "50%" means the characters, not a pattern.
export const likeEscape = (text: string) => text.replace(/[\\%_]/g, "\\$&");

// Customers whose name contains the typed text, A to Z. Empty text lists the first few.
export async function findCustomers(db: Database, typed: string, limit = 10): Promise<CustomerChoice[]> {
  const text = typed.trim().slice(0, MAX_CUSTOMER_NAME);
  return db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(text ? ilike(customers.name, `%${likeEscape(text)}%`) : undefined)
    .orderBy(asc(customers.name))
    .limit(limit);
}

export async function addCustomer(
  db: Database,
  input: { name: unknown; phone?: unknown; email?: unknown },
): Promise<{ customer: CustomerChoice } | { error: string }> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!name) return { error: "Enter the Customer's name." };
  if (name.length > MAX_CUSTOMER_NAME) return { error: `Keep the Customer's name under ${MAX_CUSTOMER_NAME} characters.` };
  if (phone.length > MAX_PHONE) return { error: `Keep the phone number under ${MAX_PHONE} characters.` };
  if (email && (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL)) return { error: "Enter a valid email address, or leave it blank." };
  const [created] = await db
    .insert(customers)
    .values({ name, phone: phone || null, email: email || null })
    .returning({ id: customers.id, name: customers.name });
  return { customer: created! };
}
