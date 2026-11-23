"use client";

import { useActionState } from "react";
import { accept } from "./actions";

export function AcceptTermsForm() {
  const [state, formAction, pending] = useActionState(accept, {});
  return (
    <form action={formAction} className="stack" aria-label="Accept the terms of use">
      <label className="inline">
        <input type="checkbox" name="agree" required />I have read and accept the terms of use
      </label>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        Accept and continue
      </button>
    </form>
  );
}
