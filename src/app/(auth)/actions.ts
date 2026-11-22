"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CONFIRM_EMAIL_PATH, getAuth, resendConfirmationLink } from "@/auth";
import { getDatabase } from "@/db";
import { getSignedInUser } from "../session";
import { authErrorMessage } from "./error-messages";

export type AuthFormState = { error?: string; notice?: string };

// The same words whether or not the address has an account, so the page never shows who is signed up.
const RESET_LINK_SENT =
  "If that email address has a Com-Install Job Cards account, we've sent it a link to choose a new password. The link works once, for 1 hour.";

export async function signUp(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Enter your name." };
  if (name.length > 100) return { error: "Use a shorter name (100 characters at most)." };
  try {
    await (await getAuth()).api.signUpEmail({
      body: {
        name,
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
        callbackURL: CONFIRM_EMAIL_PATH,
      },
      headers: await headers(),
    });
  } catch (error) {
    return { error: authErrorMessage(error, "Couldn't create your account.") };
  }
  redirect("/");
}

export async function signIn(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    await (await getAuth()).api.signInEmail({
      body: {
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      },
      headers: await headers(),
    });
  } catch (error) {
    return { error: authErrorMessage(error, "Email or password is incorrect.") };
  }
  redirect("/");
}

export async function requestPasswordReset(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    await (await getAuth()).api.requestPasswordReset({ body: { email: String(form.get("email") ?? "").trim() } });
  } catch (error) {
    return { error: authErrorMessage(error, "Enter a valid email address.") };
  }
  return { notice: RESET_LINK_SENT };
}

export async function resetPassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    await (await getAuth()).api.resetPassword({
      body: { token: String(form.get("token") ?? ""), newPassword: String(form.get("password") ?? "") },
    });
  } catch (error) {
    return { error: authErrorMessage(error, "Couldn't change your password. Ask for a new link and try again.") };
  }
  redirect("/sign-in?reset=done");
}

// "Send the link again", for a signed-in User who hasn't confirmed their email address yet.
export async function resendConfirmation(_state: AuthFormState, _form: FormData): Promise<AuthFormState> {
  const user = await getSignedInUser();
  if (!user) redirect("/sign-in");
  const result = await resendConfirmationLink(await getAuth(), await getDatabase(), user, await headers());
  if ("waitSeconds" in result) {
    return {
      error: `We sent you a link less than a minute ago. Check your inbox and spam folder, or try again in ${result.waitSeconds} seconds.`,
    };
  }
  if ("alreadyConfirmed" in result) return { notice: "Your email address is already confirmed. Reload the page." };
  return { notice: `We've sent a new link to ${user.email}. It works for 1 hour.` };
}

export async function signOut() {
  await (await getAuth()).api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
