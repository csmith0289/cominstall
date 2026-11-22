// The Audit Log: an append-only record of who changed a Job Card's Status, reassigned it, or changed a User or an
// Invitation, and when. Every Operator change is marked as one. No IP addresses or user agents.

import type { Database } from "@/db";
import { auditLog, type AuditDetail } from "@/db/schema";

export type AuditKind =
  | "invitation_sent"
  | "invitation_resent"
  | "invitation_cancelled"
  | "invitation_accepted"
  | "job_card_submitted"
  | "job_card_completed"
  | "job_card_reopened"
  | "job_card_reassigned"
  | "user_role_changed"
  | "user_deactivated"
  | "user_reactivated"
  | "customers_merged"
  | "vehicles_merged"
  | "terms_accepted";

export type AuditEntryInput = {
  actorUserId: string;
  asOperator?: boolean;
  kind: AuditKind;
  jobCardId?: string | null;
  subjectUserId?: string | null;
  detail?: AuditDetail;
};

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

// Pass the transaction that made the change, so the entry and the change stand or fall together.
export async function recordAudit(exec: Executor, entry: AuditEntryInput): Promise<void> {
  await exec.insert(auditLog).values({ ...entry, asOperator: entry.asOperator ?? false, detail: entry.detail ?? {} });
}
