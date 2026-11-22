import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

// Resolved from the project root rather than this file, which the bundler moves.
export const migrationsFolder = join(process.cwd(), "drizzle");

// PGlite (Postgres running in-process) is used for development and tests.
// Pass a directory to persist it, or nothing for an in-memory database.
export async function openPglite(dataDir?: string): Promise<Database> {
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = drizzlePglite({ client: new PGlite(dataDir), schema });
  await migratePglite(db, { migrationsFolder });
  return db;
}

export function openPostgres(connectionString: string): Database {
  return drizzlePostgres(connectionString, { schema });
}

// Kept on globalThis, not in this module: Next.js bundles Route Handlers separately from pages and
// server actions, each with its own copy of this module, and the dev server re-runs modules on change.
// Two PGlite instances on one folder don't see each other's writes and corrupt it.
const process_ = globalThis as typeof globalThis & { __cominstallDatabase?: Promise<Database> };

// The app's database: Postgres when DATABASE_URL is set, otherwise a local PGlite database.
export function getDatabase(): Promise<Database> {
  process_.__cominstallDatabase ??= process.env.DATABASE_URL
    ? Promise.resolve(openPostgres(process.env.DATABASE_URL))
    : openPglite(process.env.PGLITE_DIR ?? ".data/pglite");
  return process_.__cominstallDatabase;
}
