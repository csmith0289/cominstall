import { rm } from "node:fs/promises";
import type { FullConfig } from "@playwright/test";
import { E2E_OUTBOX_DIR } from "./outbox";

// The first request to each page of a fresh server is slow (database open, auth set-up, page chunks
// loading). When every worker makes its first request at once, that can outlast a test's timeout (#100),
// so make those first requests here, one at a time, before any test starts.
const firstPages = ["/api/health", "/sign-in"];

export default async function globalSetup(config: FullConfig) {
  // Each run starts with a fresh database, so emails from earlier runs only hold dead or expired links. Without this,
  // linkInEmail() could open one of them.
  await rm(E2E_OUTBOX_DIR, { recursive: true, force: true });
  const baseURL = config.projects[0]!.use.baseURL!;
  for (const path of firstPages) {
    const started = Date.now();
    const response = await fetch(new URL(path, baseURL));
    if (!response.ok) throw new Error(`Warming ${path} failed: ${response.status}`);
    console.log(`warmed ${path} in ${Date.now() - started} ms`);
  }
}
