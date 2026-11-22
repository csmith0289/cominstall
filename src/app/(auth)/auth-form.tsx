"use client";

import { useActionState } from "react";
import type { AuthFormState } from "./actions";

type Props = {
  action: (state: AuthFormState, form: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  askName?: boolean;
};

export function AuthForm({ action, submitLabel, askName = false }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="stack">
      {askName && (
        <label>
          Your name
          <input name="name" required autoComplete="name" />
        </label>
      )}
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={askName ? "new-password" : "current-password"}
        />
      </label>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
