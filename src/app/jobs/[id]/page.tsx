import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db";
import { jobCardForEngineer } from "@/job-cards";
import { requireUser } from "../../session";
import { JobCardForm } from "./job-card-form";

// One of the signed-in Engineer's own Job Cards. Anyone else's, or a made-up id, is a 404.
export default async function JobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const engineer = await requireUser();
  const { id } = await params;
  const card = await jobCardForEngineer(await getDatabase(), { id, engineerId: engineer.id });
  if (!card) notFound();
  return (
    <main className="job-card-page">
      <p>
        <Link href="/jobs">← My Jobs</Link>
      </p>
      <JobCardForm card={card} />
    </main>
  );
}
