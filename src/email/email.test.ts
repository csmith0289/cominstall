import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMailer, readOutbox } from "./index";

const email = { to: "engineer@example.com", subject: "Choose a new password", text: "Open this link: https://x/y" };

function failingFetch() {
  return vi.fn<typeof globalThis.fetch>(async () => {
    throw new Error("No network in tests");
  });
}

describe("createMailer", () => {
  it("writes each email to the outbox and the log, and never reaches the network, when Resend isn't set up", async () => {
    const outboxDir = await mkdtemp(join(tmpdir(), "outbox-"));
    const fetch = failingFetch();
    const log = vi.fn();
    const send = createMailer({ env: { EMAIL_OUTBOX_DIR: outboxDir }, fetch, log });

    await send(email);

    expect(fetch).not.toHaveBeenCalled();
    expect(await readOutbox(outboxDir)).toEqual([expect.objectContaining(email)]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Open this link: https://x/y"));
  });

  it("still logs the whole email, and doesn't fail, when the outbox folder can't be written (Netlify)", async () => {
    // A folder inside a file can never be created, on any platform.
    const blocker = join(await mkdtemp(join(tmpdir(), "outbox-")), "a-file");
    await writeFile(blocker, "not a folder");
    const log = vi.fn();
    const send = createMailer({ env: { EMAIL_OUTBOX_DIR: join(blocker, "outbox") }, fetch: failingFetch(), log });

    await expect(send(email)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Open this link: https://x/y"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(email.to));
  });

  it("needs both RESEND_API_KEY and EMAIL_FROM before it uses Resend", async () => {
    const outboxDir = await mkdtemp(join(tmpdir(), "outbox-"));
    const fetch = failingFetch();
    for (const env of [{ RESEND_API_KEY: "re_123" }, { EMAIL_FROM: "Job Cards <jobcards@example.com>" }]) {
      await createMailer({ env: { ...env, EMAIL_OUTBOX_DIR: outboxDir }, fetch, log: () => {} })(email);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(await readdir(outboxDir)).toHaveLength(2);
  });

  it("sends a plain-text email through Resend when RESEND_API_KEY and EMAIL_FROM are set", async () => {
    const outboxDir = await mkdtemp(join(tmpdir(), "outbox-"));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    const send = createMailer({
      env: { RESEND_API_KEY: "re_123", EMAIL_FROM: "Job Cards <jobcards@example.com>", EMAIL_OUTBOX_DIR: outboxDir },
      fetch,
      log: () => {},
    });

    await send(email);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer re_123");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Job Cards <jobcards@example.com>",
      to: ["engineer@example.com"],
      subject: "Choose a new password",
      text: "Open this link: https://x/y",
    });
    expect(await readdir(outboxDir)).toHaveLength(0);
  });

  it("fails loudly when Resend refuses the email", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("domain not verified", { status: 403 }));
    const send = createMailer({ env: { RESEND_API_KEY: "re_123", EMAIL_FROM: "a@example.com" }, fetch, log: () => {} });
    await expect(send(email)).rejects.toThrow(/403/);
  });
});
