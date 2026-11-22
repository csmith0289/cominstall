"use client";

import { useActionState } from "react";
import { requestPasswordReset, resendConfirmation, resetPassword } from "./actions";

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
