import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Email = { to: string; subject: string; text: string };
export type Mailer = (email: Email) => Promise<void>;

type Env = Record<string, string | undefined>;

export const DEFAULT_OUTBOX_DIR = ".data/outbox";

// Sends through Resend once RESEND_API_KEY and EMAIL_FROM are both set (production). Otherwise (development
// and tests) each email goes to the server log and to a JSON file in the outbox folder, and nothing touches
// the network.
export function createMailer({
  env = process.env,
  fetch = globalThis.fetch,
  log = console.log,
}: { env?: Env; fetch?: typeof globalThis.fetch; log?: (line: string) => void } = {}): Mailer {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (apiKey && from) {
    return async ({ to, subject, text }) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (!response.ok) throw new Error(`Resend refused the email to ${to}: ${response.status} ${await response.text()}`);
    };
  }
  const outboxDir = env.EMAIL_OUTBOX_DIR || DEFAULT_OUTBOX_DIR;
  // The log line comes first and holds the whole email, link included: without Resend, it's how links reach people
  // (copied out of the function logs). The outbox file is a convenience for development and e2e; where the
  // filesystem is read-only (Netlify) writing it fails, and that failure is ignored.
  return async (email) => {
    log(`Email (not sent; Resend isn't set up) to ${email.to}: ${email.subject}\n${email.text}`);
    try {
      await mkdir(outboxDir, { recursive: true });
      const sentAt = new Date().toISOString();
      const file = `${sentAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
      await writeFile(join(outboxDir, file), JSON.stringify({ ...email, sentAt }, null, 2));
    } catch {
      // Read-only filesystem: the log line above already has everything.
    }
  };
}

// The emails in an outbox folder, oldest first.
export async function readOutbox(outboxDir: string): Promise<(Email & { sentAt: string })[]> {
  const files = (await readdir(outboxDir).catch(() => [])).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(outboxDir, file), "utf8"))));
}
