// The terms of use and privacy notice (ticket 11). Every User accepts the current terms version before anything else;
// bumping TERMS_VERSION asks everyone again. Each acceptance is stored on the User and written to the Audit Log.

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { recordAudit } from "@/audit";
import type { Database } from "@/db";
import { user } from "@/db/schema";

// Bump this whenever the wording of /terms changes in a way Users must agree to again.
export const TERMS_VERSION = "2026-11-23-draft";

// True until the user's agreed final text replaces the draft. Both pages then show a DRAFT banner.
export const LEGAL_TEXT_IS_DRAFT = true;

export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";
export const ACCEPT_TERMS_PATH = "/accept-terms";

export function needsTermsAcceptance(account: { termsVersion: string | null | undefined }, currentVersion: string = TERMS_VERSION): boolean {
  return account.termsVersion !== currentVersion;
}

// Records that the User accepted this version now. Accepting the version they already accepted changes nothing, so a
// double tap leaves one Audit Log entry.
export async function acceptTerms(
  db: Database,
  input: { userId: string; version?: string; now?: Date; asOperator?: boolean },
): Promise<void> {
  const { userId, version = TERMS_VERSION, now = new Date(), asOperator } = input;
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ termsVersion: version, termsAcceptedAt: now, updatedAt: now })
      .where(and(eq(user.id, userId), or(isNull(user.termsVersion), ne(user.termsVersion, version))))
      .returning({ id: user.id });
    if (updated.length === 0) return;
    await recordAudit(tx, { actorUserId: userId, asOperator, kind: "terms_accepted", subjectUserId: userId, detail: { version } });
  });
}

// The footer line for the Job Card PDF (ticket 05), linking to the privacy notice on the app's own address.
export function jobCardPdfFooter(appUrl: string): string {
  return `Com-Install Ltd · Privacy notice: ${appUrl.replace(/\/+$/, "")}${PRIVACY_PATH}`;
}
