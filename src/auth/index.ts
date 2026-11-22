import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDatabase, type Database } from "@/db";
import * as schema from "@/db/schema";
import { createMailer, type Mailer } from "@/email";
import { ACCOUNT_DEACTIVATED_CODE, ACCOUNT_DEACTIVATED_MESSAGE } from "./deactivated";
import { confirmEmailMessage, passwordResetMessage } from "./emails";
import { acceptInvitation, roleForNewAccount, SIGNUPS_CLOSED_CODE, SIGNUPS_CLOSED_MESSAGE } from "./sign-up-rules";

export { SIGNUPS_CLOSED_MESSAGE } from "./sign-up-rules";
export { ACCOUNT_DEACTIVATED_CODE, ACCOUNT_DEACTIVATED_MESSAGE } from "./deactivated";

// Password reset and email confirmation links both expire after this long.
const LINK_LIFETIME_SECONDS = 60 * 60;
// "Send the link again" sends at most one confirmation link a minute.
const RESEND_INTERVAL_SECONDS = 60;
// Where the confirmation link lands once it has done its work.
export const CONFIRM_EMAIL_PATH = "/confirm-email";

// `env` supplies ADMIN_EMAILS (who becomes an Admin at sign-up); tests pass their own.
type Options = { appUrl?: string; mailer?: Mailer; env?: Record<string, string | undefined> };

export function createAuth(
  db: Database,
  { appUrl = process.env.BETTER_AUTH_URL, mailer = createMailer(), env = process.env }: Options = {},
) {
  // The Role a new account gets; refuses an email with no Invitation that isn't in ADMIN_EMAILS. A missing or
  // non-string email is left to Better Auth's own validation, which answers 400.
  const roleOrRefuse = async (email: unknown) => {
    if (typeof email !== "string") return null;
    const role = await roleForNewAccount(db, email, env);
    if (!role) throw new APIError("FORBIDDEN", { code: SIGNUPS_CLOSED_CODE, message: SIGNUPS_CLOSED_MESSAGE });
    return role;
  };
  // A failed send is logged, not thrown: it mustn't undo a sign-up, or tell anyone whether an address has an account.
  const send = async (to: string, message: { subject: string; text: string }) => {
    try {
      await mailer({ to, ...message });
    } catch (error) {
      console.error(error);
    }
  };
  return betterAuth({
    baseURL: appUrl,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Com-Install's own columns on the user table (src/db/auth-schema.ts). `input: false`: never taken from a request.
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "engineer", input: false },
        deactivatedAt: { type: "date", required: false, input: false },
        termsVersion: { type: "string", required: false, input: false },
        termsAcceptedAt: { type: "date", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: LINK_LIFETIME_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Better Auth's own link goes through its API and a redirect; ours opens the page straight away.
      sendResetPassword: async ({ user, token }) => {
        await send(user.email, passwordResetMessage(`${appUrl ?? ""}/reset-password?token=${encodeURIComponent(token)}`));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: LINK_LIFETIME_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await recordConfirmationLinkSent(db, user.id);
        await send(user.email, confirmEmailMessage(url));
      },
    },
    hooks: {
      // Before Better Auth looks the email up, so an uninvited address gets the same refusal whether or not it has an
      // account. Covers the server action and a direct POST alike.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") await roleOrRefuse(ctx.body?.email);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Sets the Role from ADMIN_EMAILS or the Invitation, and refuses anyone else: a backstop for any way an
          // account could be created.
          before: async (user) => {
            const role = await roleOrRefuse(user.email);
            return { data: { ...user, role: role ?? "engineer" } };
          },
          after: async (user) => {
            await acceptInvitation(db, user.email);
          },
        },
      },
      session: {
        create: {
          // A deactivated User can't sign in. Existing sessions are ended when they're deactivated (ticket 08) and
          // refused by requireUser() in the meantime.
          before: async (session) => {
            const [found] = await db
              .select({ deactivatedAt: schema.user.deactivatedAt })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId));
            if (found?.deactivatedAt) {
              throw new APIError("FORBIDDEN", { code: ACCOUNT_DEACTIVATED_CODE, message: ACCOUNT_DEACTIVATED_MESSAGE });
            }
          },
        },
      },
    },
    // Must be last, so server actions can set the session cookie.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// The time of the last confirmation link, kept in Better Auth's verification table so it holds across servers.
const sentMarker = (userId: string) => `confirmation-link-sent:${userId}`;

async function recordConfirmationLinkSent(db: Database, userId: string) {
  const now = new Date();
  await db.delete(schema.verification).where(eq(schema.verification.identifier, sentMarker(userId)));
  await db.insert(schema.verification).values({
    id: randomUUID(),
    identifier: sentMarker(userId),
    value: now.toISOString(),
    expiresAt: new Date(now.getTime() + RESEND_INTERVAL_SECONDS * 1000),
  });
}

export type ResendResult = { sent: true } | { waitSeconds: number } | { alreadyConfirmed: true };

// "Send the link again": a new confirmation link, unless one went out less than a minute ago.
export async function resendConfirmationLink(
  auth: Auth,
  db: Database,
  user: { id: string; email: string; emailVerified: boolean },
  headers?: Headers,
): Promise<ResendResult> {
  if (user.emailVerified) return { alreadyConfirmed: true };
  const [marker] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, sentMarker(user.id)));
  const waitMs = marker ? marker.expiresAt.getTime() - Date.now() : 0;
  if (waitMs > 0) return { waitSeconds: Math.ceil(waitMs / 1000) };
  await auth.api.sendVerificationEmail({ body: { email: user.email, callbackURL: CONFIRM_EMAIL_PATH }, headers });
  return { sent: true };
}

let shared: Promise<Auth> | undefined;

export function getAuth(): Promise<Auth> {
  shared ??= getDatabase().then((db) => createAuth(db));
  return shared;
}
