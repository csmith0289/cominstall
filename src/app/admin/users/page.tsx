import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDatabase } from "@/db";
import { user } from "@/db/schema";
import { openInvitations } from "@/invitations";
import { requireAdmin } from "../../session";
import { InvitationActions, InviteForm } from "./forms";

const ROLE_LABELS = { engineer: "Engineer", admin: "Admin" } as const;

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

// Admin → Users: invite Users and look after pending Invitations. Ticket 08 adds changing Roles and deactivating.
export default async function UsersPage() {
  await requireAdmin();
  const db = await getDatabase();
  const [pending, users] = await Promise.all([
    openInvitations(db),
    db.select({ id: user.id, name: user.name, email: user.email, role: user.role }).from(user).orderBy(asc(user.name)),
  ]);
  const now = new Date();
  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Users</h1>

      <section className="stack">
        <h2>Invite a User</h2>
        <p className="muted">They get an email with a link that works for 7 days, to set their name and password.</p>
        <InviteForm />
      </section>

      <section>
        <h2>Invitations</h2>
        {pending.length === 0 ? (
          <p className="muted">No pending Invitations.</p>
        ) : (
          <ul className="cards">
            {pending.map((invitation) => {
              const expired = invitation.expiresAt <= now;
              return (
                <li key={invitation.id} className="card">
                  <p className="wrap">
                    <strong>{invitation.email}</strong>
                    <br />
                    {ROLE_LABELS[invitation.role]} ·{" "}
                    {expired ? (
                      <span className="status-pending">Expired {dateFormat.format(invitation.expiresAt)}</span>
                    ) : (
                      <span>Link works until {dateFormat.format(invitation.expiresAt)}</span>
                    )}
                  </p>
                  <InvitationActions invitationId={invitation.id} email={invitation.email} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2>Everyone with an account</h2>
        <ul className="cards">
          {users.map((account) => (
            <li key={account.id} className="card wrap">
              <strong>{account.name}</strong>
              <br />
              {account.email} · {ROLE_LABELS[account.role]}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
