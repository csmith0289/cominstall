import Link from "next/link";
import { requireAdmin } from "../session";

// The Admin dashboard. Tickets 06 and 08 fill it in.
export default async function AdminPage() {
  await requireAdmin();
  return (
    <main>
      <h1>Admin</h1>
      <ul>
        <li>
          <Link href="/admin/users">Users</Link>: invite Engineers and Admins, change Roles, and deactivate or reactivate Users.
        </li>
      </ul>
      <p className="muted">Job Card counts and all Job Cards will appear here.</p>
    </main>
  );
}
