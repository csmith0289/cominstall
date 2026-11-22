import { requireAdmin } from "../session";

// The Admin dashboard. Tickets 02, 06 and 08 fill it in.
export default async function AdminPage() {
  await requireAdmin();
  return (
    <main>
      <h1>Admin</h1>
      <p>Job Card counts, all Job Cards and Users will appear here.</p>
    </main>
  );
}
