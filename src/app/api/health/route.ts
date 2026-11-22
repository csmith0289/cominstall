import { sql } from "drizzle-orm";
import { getDatabase } from "@/db";

// Answers once the database is open and migrated. The e2e web server waits on this, so tests
// never race the first, slow open of a fresh database (#100); a host can use it as a health check.
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDatabase();
  await db.execute(sql`select 1`);
  return Response.json({ ok: true });
}
