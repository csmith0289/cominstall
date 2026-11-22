import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { TestProject } from "vitest/node";
import { migrationsFolder } from "./index";
import * as schema from "./schema";

declare module "vitest" {
  interface ProvidedContext {
    migratedDataDir: string;
  }
}

// Vitest global setup: migrating a PGlite takes seconds, so the run migrates one once and saves
// its data directory for createTestDatabase to copy.
export default async function setup(project: TestProject) {
  const client = new PGlite();
  await migrate(drizzle({ client, schema }), { migrationsFolder });
  const dump = await client.dumpDataDir("none");
  await client.close();

  const path = join(tmpdir(), `cominstall-test-db-${process.pid}.tar`);
  await writeFile(path, new Uint8Array(await dump.arrayBuffer()));
  project.provide("migratedDataDir", path);
  return () => rm(path, { force: true });
}
