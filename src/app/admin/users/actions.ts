"use server";

import { revalidatePath } from "next/cache";
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
  revalidatePath("/admin/users");
  if ("error" in result) return { error: result.error };
  return { notice: `Invitation sent again, with a new link that works for 7 days. The old link no longer works. ${EMAIL_NOTE}` };
}

export async function cancel(_state: InvitationFormState, form: FormData): Promise<InvitationFormState> {
  const admin = await requireAdmin();
  const result = await cancelInvitation(await getDatabase(), { actorUserId: admin.id, invitationId: String(form.get("invitationId") ?? "") });
  revalidatePath("/admin/users");
  if ("error" in result) return { error: result.error };
  return { notice: "Invitation cancelled. Its link no longer works." };
}
