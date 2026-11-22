// Applies the Drizzle migrations to the Postgres database named by DATABASE_URL.
// Run on deploy (the `vercel-build` script), never at request time. Without DATABASE_URL there is nothing to do:
// development and tests migrate their own PGlite database when they open it.
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set; skipping migrations.");
} else {
  const db = drizzle(process.env.DATABASE_URL);
  try {
    await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
    console.log("Migrations applied to DATABASE_URL.");
  } finally {
    await db.$client.end();
  }
}
