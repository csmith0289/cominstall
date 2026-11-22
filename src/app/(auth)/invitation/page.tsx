import Link from "next/link";
import { getDatabase } from "@/db";
import { invitationForLink } from "@/invitations";
import { invitationLinkMessage } from "@/invitations/messages";
import { AcceptInvitationForm } from "../account-forms";

// A repeated query parameter (?token=a&token=b) arrives as an array.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ROLE_NAMES = { engineer: "an Engineer", admin: "an Admin" } as const;

// Opened from the link in the invitation email.
export default async function InvitationPage({ searchParams }: Props) {
  const { token: param } = await searchParams;
  const token = typeof param === "string" ? param : "";
  const link = await invitationForLink(await getDatabase(), token);
  if (link.state !== "pending") {
    return (
      <main className="narrow">
        <h1>Invitation link not valid</h1>
        <p role="alert" className="error">
          {invitationLinkMessage(link.state)}
        </p>
        <p>
          <Link href="/sign-in">Sign in</Link>
        </p>
      </main>
    );
  }
  const { email, role } = link.invitation;
  return (
    <main className="narrow">
      <h1>Set up your account</h1>
      <p>
        You&apos;ve been invited to Com-Install Job Cards as {ROLE_NAMES[role]}. Your email address is <strong>{email}</strong>.
      </p>
      <AcceptInvitationForm token={token} email={email} />
    </main>
  );
}
