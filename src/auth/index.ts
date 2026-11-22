import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDatabase, type Database } from "@/db";
import * as schema from "@/db/schema";
import { createMailer, type Mailer } from "@/email";
import { ACCOUNT_DEACTIVATED_CODE, ACCOUNT_DEACTIVATED_MESSAGE } from "./deactivated";
import { markInvitationAccepted } from "@/invitations";
import { confirmEmailMessage, passwordResetMessage } from "./emails";
import { isListedEmail } from "./listed-email";
import { roleForNewAccount, SIGNUPS_CLOSED_CODE, SIGNUPS_CLOSED_MESSAGE } from "./sign-up-rules";

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
  // The Role a new account gets; refuses an email that isn't in ADMIN_EMAILS and doesn't bring the token from its
  // pending Invitation. A missing or non-string email is left to Better Auth's own validation, which answers 400.
  const roleOrRefuse = async (email: unknown, invitationToken: string | undefined) => {
    if (typeof email !== "string") return null;
    const role = await roleForNewAccount(db, email, env, new Date(), invitationToken);
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
        // Someone who signed up from their invitation link has already shown the email is theirs.
        if (user.emailVerified) return;
        await recordConfirmationLinkSent(db, user.id);
        await send(user.email, confirmEmailMessage(url));
      },
    },
    hooks: {
      // Before Better Auth looks the email up, so an uninvited address gets the same refusal whether or not it has an
      // account. Covers the server action and a direct POST alike.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") await roleOrRefuse(ctx.body?.email, invitationTokenIn(ctx.body));
        // A deactivated User's existing session is ended the first time it reaches Better Auth's API, so the endpoint
        // then sees no session: get-session answers null, and anything needing a session answers 401.
        const current = await getSessionFromCtx(ctx);
        if ((current?.user as { deactivatedAt?: Date | null } | undefined)?.deactivatedAt) {
          await ctx.context.internalAdapter.deleteUserSessions(current!.user.id);
          ctx.context.session = null;
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Sets the Role from ADMIN_EMAILS or the Invitation, and refuses anyone else: a backstop for any way an
          // account could be created. The invitation link went to this email, so bringing its token confirms it.
          before: async (user, ctx) => {
            const token = invitationTokenIn(ctx?.body);
            const role = await roleOrRefuse(user.email, token);
            const invited = !!token && !isListedEmail(user.email, env.ADMIN_EMAILS);
            return { data: { ...user, role: role ?? "engineer", ...(invited && { emailVerified: true }) } };
          },
          after: async (user, ctx) => {
            const token = invitationTokenIn(ctx?.body);
            if (token) await markInvitationAccepted(db, { token, userId: user.id });
          },
        },
      },
      session: {
        create: {
          // A deactivated User can't sign in. Their existing sessions are ended by hooks.before above; ticket 08 also
          // ends them at the moment of deactivation.
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

// The invitation token a sign-up brings in its body (the invitation page's form), if any.
function invitationTokenIn(body: unknown): string | undefined {
  const token = (body as { invitationToken?: unknown } | null | undefined)?.invitationToken;
  return typeof token === "string" && token ? token : undefined;
}

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
