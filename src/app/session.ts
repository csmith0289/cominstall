import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/auth";
import type { Role } from "@/db/schema";
import { ACCEPT_TERMS_PATH, needsTermsAcceptance } from "@/legal";
import { isOperator } from "@/operator";

// Every page, server action and route handler starts from one of these, so the access rules live in one place.

export type SignedInUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  deactivatedAt: Date | null;
  // The terms of use version they accepted, if any. requireUser() insists on the current one.
  termsVersion: string | null;
};

export async function getSignedInUser(): Promise<SignedInUser | undefined> {
  // Read the request headers first: it marks the page as dynamic before the database is touched.
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  const found = session?.user as (SignedInUser & { deactivatedAt?: Date | null }) | undefined;
  // A deactivated User's existing session counts as signed out.
  if (!found || found.deactivatedAt) return undefined;
  return { ...found, role: found.role === "admin" ? "admin" : "engineer", deactivatedAt: null, termsVersion: found.termsVersion ?? null };
}

// Any active User (Engineer or Admin) who has accepted the current terms of use. Anyone signed out goes to the sign-in
// page; a User who hasn't accepted the current terms goes to accept them before anything else.
export async function requireUser(): Promise<SignedInUser> {
  const user = await getSignedInUser();
  if (!user) redirect("/sign-in");
  if (needsTermsAcceptance(user)) redirect(ACCEPT_TERMS_PATH);
  return user;
}

// An Admin. Engineers get a plain 404, so Admin pages aren't advertised.
export async function requireAdmin(): Promise<SignedInUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

// The Operator (OPERATOR_EMAILS, confirmed). Anyone else, signed in or not, gets a 404.
export async function requireOperator(): Promise<SignedInUser> {
  const user = await getSignedInUser();
  if (!user || !isOperator(user)) notFound();
  if (needsTermsAcceptance(user)) redirect(ACCEPT_TERMS_PATH);
  return user;
}
