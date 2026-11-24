"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { changeRole, deactivateUser, reactivateUser, reassignJobCards } from "@/users";
import { getDatabase } from "@/db";
import { createMailer } from "@/email";
import { cancelInvitation, inviteUser, resendInvitation } from "@/invitations";
import { requireAdmin } from "../../session";

export type InvitationFormState = { error?: string; notice?: string };

const ROLE_NAMES: Record<string, string> = { engineer: "an Engineer", admin: "an Admin" };
// The link itself never appears on screen: it belongs to the invitee.
const EMAIL_NOTE = "The invitation email goes out if email is set up for the app.";

const sending = (actorUserId: string) => ({ actorUserId, appUrl: process.env.BETTER_AUTH_URL, mailer: createMailer() });

export async function invite(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const email = String(form.get("email") ?? "");
  const role = String(form.get("role") ?? "");
  const result = await inviteUser(await getDatabase(), { ...sending(admin.id), email, role });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/users");
  return { notice: `Invited ${email.trim().toLowerCase()} as ${ROLE_NAMES[role]}. ${EMAIL_NOTE}` };
}

export async function resend(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const result = await resendInvitation(await getDatabase(), { ...sending(admin.id), invitationId: String(form.get("invitationId") ?? "") });
  // On an error, don't refresh: the refresh would remove the stale row, and the message with it.
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/users");
  return { notice: `Invitation sent again, with a new link that works for 7 days. The old link no longer works. ${EMAIL_NOTE}` };
}

// Managing Users (ticket 08). On an error, don't refresh: the message belongs to the row on screen.

const ROLE_AFTER: Record<string, string> = { engineer: "an Engineer", admin: "an Admin" };
const nameOf = async (userId: string) =>
  (await (await getDatabase()).select({ name: user.name }).from(user).where(eq(user.id, userId)))[0]?.name ?? "The User";

export async function changeUserRole(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const userId = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "");
  const result = await changeRole(await getDatabase(), { actorUserId: admin.id, userId, role });
  if ("error" in result) return { error: result.error };
  // An Admin who made themselves an Engineer can't see this page any more.
  if (userId === admin.id && role === "engineer") redirect("/jobs");
  revalidatePath("/admin/users");
  return { notice: `${await nameOf(userId)} is now ${ROLE_AFTER[role]}.` };
}

export async function deactivate(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const userId = String(form.get("userId") ?? "");
  const result = await deactivateUser(await getDatabase(), { actorUserId: admin.id, userId });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/users");
  return { notice: `${await nameOf(userId)} is deactivated and signed out everywhere.` };
}

export async function reactivate(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const userId = String(form.get("userId") ?? "");
  const result = await reactivateUser(await getDatabase(), { actorUserId: admin.id, userId });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/users");
  return { notice: `${await nameOf(userId)} can sign in again.` };
}

export async function moveJobCards(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const toUserId = String(form.get("toUserId") ?? "");
  const result = await reassignJobCards(await getDatabase(), { actorUserId: admin.id, fromUserId: String(form.get("fromUserId") ?? ""), toUserId });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/users");
  return { notice: `Moved ${result.count} Job Card${result.count === 1 ? "" : "s"} to ${await nameOf(toUserId)}.` };
}

export async function cancel(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const result = await cancelInvitation(await getDatabase(), { actorUserId: admin.id, invitationId: String(form.get("invitationId") ?? "") });
  if ("error" in result) return { error: result.error };
  revalidatePath("/admin/users");
  return { notice: "Invitation cancelled. Its link no longer works." };
}
