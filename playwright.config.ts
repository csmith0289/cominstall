import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_OPERATOR_EMAIL, E2E_PHONE_ADMIN_EMAILS } from "./e2e/accounts";

const port = 3100;
const baseURL = `http://localhost:${port}`;
const stamp = Date.now();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // One browser at a time, as on Batch & Label: parallel sign-ups on a busy machine outlast the timeouts.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /\.phone\.spec\.ts$/ },
    {
      // iPhone-sized screen. Chromium for now; ticket 13 adds real WebKit.
      name: "iphone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      testMatch: /\.phone\.spec\.ts$/,
    },
    {
      // Android-sized screen.
      name: "android",
      use: { ...devices["Pixel 7"] },
      testMatch: /\.phone\.spec\.ts$/,
    },
  ],
  webServer: {
    // A production build, so timings reflect what Engineers will see.
    command: `corepack pnpm build && corepack pnpm start --port ${port}`,
    // Waits for the database to be open and migrated, not just for the port.
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-use-0123456789",
      BETTER_AUTH_URL: baseURL,
      PGLITE_DIR: `.data/e2e-${stamp}`,
      // Never Resend: emails go to the outbox, where the tests read them (e2e/outbox.ts).
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      EMAIL_OUTBOX_DIR: ".data/e2e-outbox",
      ADMIN_EMAILS: [E2E_ADMIN_EMAIL, ...E2E_PHONE_ADMIN_EMAILS].join(","),
      OPERATOR_EMAILS: E2E_OPERATOR_EMAIL,
    },
  },
});
