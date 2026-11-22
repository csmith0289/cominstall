import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { inject } from "vitest";
import type { Database } from "./index";
import * as schema from "./schema";

// The data directory test-database.setup.ts migrated once for the whole run.
let migrated: Promise<Blob> | undefined;

function migratedDataDir(): Promise<Blob> {
  migrated ??= readFile(inject("migratedDataDir")).then((bytes) => new Blob([bytes]));
  return migrated;
}

// A fresh, fully migrated in-memory Postgres for each test. `onQuery` sees every statement Drizzle sends, so a test
// can count database round trips.
export async function createTestDatabase(options: { onQuery?: (query: string) => void } = {}): Promise<Database> {
  const client = new PGlite({ loadDataDir: await migratedDataDir() });
  const { onQuery } = options;
  return drizzle({ client, schema, ...(onQuery && { logger: { logQuery: (query: string) => onQuery(query) } }) });
}
