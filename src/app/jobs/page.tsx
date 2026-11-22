import { requireUser } from "../session";

// My Jobs. The list itself is ticket 04; ticket 03 adds New Job Card.
export default async function MyJobsPage() {
  const user = await requireUser();
  return (
    <main>
      <h1>My Jobs</h1>
      <p>Hello {user.name}. Your Job Cards will appear here.</p>
    </main>
  );
}
