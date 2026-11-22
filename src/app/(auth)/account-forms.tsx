"use client";

import { useActionState } from "react";
import { acceptInvitation, requestPasswordReset, resendConfirmation, resetPassword } from "./actions";

export function AcceptInvitationForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitation, {});
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the new password against the right email. */}
      <input type="hidden" name="email" value={email} autoComplete="username" />
      <label>
        Your name
        <input name="name" required maxLength={100} autoComplete="name" />
      </label>
      <label>
        Choose a password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <p className="muted">At least 8 characters.</p>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        Create account
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {});
  if (state.notice) return <p role="status">{state.notice}</p>;
  return (
    <form action={formAction} className="stack">
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        Send me a link
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, {});
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="token" value={token} />
      <label>
        New password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        Save new password
      </button>
    </form>
  );
}

export function ResendConfirmationForm() {
  const [state, formAction, pending] = useActionState(resendConfirmation, {});
  return (
    <form action={formAction} className="stack">
      {state.notice && <p role="status">{state.notice}</p>}
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="submit" className="secondary" disabled={pending}>
        Send the link again
      </button>
    </form>
  );
}
