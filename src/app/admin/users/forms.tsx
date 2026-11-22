"use client";

import { useActionState, useRef } from "react";
import { cancel, invite, resend, type InvitationFormState } from "./actions";

function Messages({ state }: { state: InvitationFormState }) {
  return (
    <>
      {state.notice && <p role="status" className="status-ok">{state.notice}</p>}
      {state.error && <p role="alert" className="error">{state.error}</p>}
    </>
  );
}

export function InviteForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (previous: InvitationFormState, form: FormData) => {
    const next = await invite(previous, form);
    if (next.notice) formRef.current?.reset();
    return next;
  }, {});
  return (
    <form ref={formRef} action={formAction} className="stack" aria-label="Invite a User">
      <label>
        Email
        <input name="email" type="email" required maxLength={254} autoComplete="off" />
      </label>
      <label>
        Role
        <select name="role" defaultValue="engineer" required>
          <option value="engineer">Engineer</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <Messages state={state} />
      <button type="submit" disabled={pending}>
        Send invitation
      </button>
    </form>
  );
}

// Resend and Cancel for one Invitation.
export function InvitationActions({ invitationId, email }: { invitationId: string; email: string }) {
  const [resendState, resendAction, resending] = useActionState(resend, {});
  const [cancelState, cancelAction, cancelling] = useActionState(cancel, {});
  const busy = resending || cancelling;
  return (
    <div className="stack">
      <div className="row">
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <button type="submit" className="secondary" disabled={busy} aria-label={`Resend invitation to ${email}`}>
            Resend
          </button>
        </form>
        <form
          action={cancelAction}
          onSubmit={(event) => {
            if (!confirm(`Cancel the invitation to ${email}? Its link will stop working.`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="invitationId" value={invitationId} />
          <button type="submit" className="secondary" disabled={busy} aria-label={`Cancel invitation to ${email}`}>
            Cancel
          </button>
        </form>
      </div>
      <Messages state={resendState} />
      <Messages state={cancelState} />
    </div>
  );
}
