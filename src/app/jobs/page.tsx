import { requireUser } from "../session";
import { NewJobCardButton } from "./new-job-card-button";

// My Jobs. The list itself is ticket 04.
export default async function MyJobsPage() {
  const user = await requireUser();
  return (
    <main>
      <h1>My Jobs</h1>
      <p>Hello {user.name}. Your Job Cards will appear here.</p>
      <NewJobCardButton />
    </main>
  );
}
