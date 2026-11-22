import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/db/test-database.setup.ts"],
    testTimeout: 20_000,
    // Each worker compiles PGlite's WebAssembly; one per core starves them and tests time out.
    maxWorkers: "40%",
  },
});
