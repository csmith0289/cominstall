import { requireUser } from "../session";
import { newJobCard } from "./actions";

// My Jobs. The list itself is ticket 04.
export default async function MyJobsPage() {
  const user = await requireUser();
  return (
    <main>
      <h1>My Jobs</h1>
      <p>Hello {user.name}. Your Job Cards will appear here.</p>
      <form action={newJobCard}>
        <button type="submit">New Job Card</button>
      </form>
    </main>
  );
}
