import Link from "next/link";
import { getDatabase } from "@/db";
import { openInvitations } from "@/invitations";
import { activeEngineers, listUsers } from "@/users";
import { requireAdmin } from "../../session";
import { InvitationActions, InviteForm, UserActions } from "./forms";

const ROLE_LABELS = { engineer: "Engineer", admin: "Admin" } as const;

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

const signInFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

// Admin → Users: invite Users, look after pending Invitations, change Roles, deactivate and reactivate Users, and move
// a deactivated User's Job Cards to another Engineer. The Operator's account isn't shown.
export default async function UsersPage() {
  const admin = await requireAdmin();
  const db = await getDatabase();
  const [pending, users, engineers] = await Promise.all([openInvitations(db), listUsers(db), activeEngineers(db)]);
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
            <li key={account.id} className="card" aria-label={account.name}>
              <p className="wrap">
                <strong>{account.name}</strong>
                {account.id === admin.id && <span className="muted"> (you)</span>}
                <br />
                {account.email}
                <br />
                {ROLE_LABELS[account.role]} ·{" "}
                {account.active ? <span className="status-ok">Active</span> : <span className="status-pending">Deactivated</span>}
                <br />
                <span className="muted">
                  Last sign-in: {account.lastSignInAt ? signInFormat.format(account.lastSignInAt) : "never"} · {account.jobCards} Job Card
                  {account.jobCards === 1 ? "" : "s"}
                </span>
              </p>
              <UserActions account={account} isSelf={account.id === admin.id} engineers={engineers} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
