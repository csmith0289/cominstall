"use client";

import { useActionState, useRef } from "react";
import { cancel, changeUserRole, deactivate, invite, moveJobCards, reactivate, resend, type InvitationFormState } from "./actions";

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
        Send Invitation
      </button>
    </form>
  );
}

type Row = { id: string; name: string; role: "engineer" | "admin"; active: boolean; jobCards: number };

// Role, deactivate or reactivate, and moving a deactivated User's Job Cards, for one User.
export function UserActions({ account, isSelf, engineers }: { account: Row; isSelf: boolean; engineers: { id: string; name: string }[] }) {
  // One state for the row, so only the latest change's message shows.
  const [state, run, busy] = useActionState((previous: InvitationFormState, form: FormData) => {
    const change = { role: changeUserRole, deactivate, reactivate, move: moveJobCards }[String(form.get("change"))];
    return change ? change(previous, form) : previous;
  }, {});
  const targets = engineers.filter((engineer) => engineer.id !== account.id);
  return (
    <div className="stack">
      <div className="row">
        <form action={run} className="row">
          <input type="hidden" name="change" value="role" />
          <input type="hidden" name="userId" value={account.id} />
          <label className="inline">
            Role
            <select name="role" defaultValue={account.role} key={account.role} aria-label={`Role for ${account.name}`}>
              <option value="engineer">Engineer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit" className="secondary" disabled={busy} aria-label={`Save Role for ${account.name}`}>
            Save Role
          </button>
        </form>
        {!isSelf && (
          <form
            action={run}
            onSubmit={(event) => {
              if (account.active && !confirm(`Deactivate ${account.name}? They are signed out at once and can't sign in.`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="change" value={account.active ? "deactivate" : "reactivate"} />
            <input type="hidden" name="userId" value={account.id} />
            <button type="submit" className="secondary" disabled={busy} aria-label={`${account.active ? "Deactivate" : "Reactivate"} ${account.name}`}>
              {account.active ? "Deactivate" : "Reactivate"}
            </button>
          </form>
        )}
      </div>
      {!account.active && account.jobCards > 0 && (
        <form action={run} className="row" aria-label={`Move Job Cards from ${account.name}`}>
          <input type="hidden" name="change" value="move" />
          <input type="hidden" name="fromUserId" value={account.id} />
          <label className="inline">
            Move their Job Cards to
            <select name="toUserId" required defaultValue="">
              <option value="" disabled>
                Choose an Engineer
              </option>
              {targets.map((engineer) => (
                <option key={engineer.id} value={engineer.id}>
                  {engineer.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary" disabled={busy || targets.length === 0}>
            Move Job Cards
          </button>
        </form>
      )}
      <Messages state={state} />
    </div>
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
          <button type="submit" className="secondary" disabled={busy} aria-label={`Resend Invitation to ${email}`}>
            Resend
          </button>
        </form>
        <form
          action={cancelAction}
          onSubmit={(event) => {
            if (!confirm(`Cancel the Invitation to ${email}? Its link will stop working.`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="invitationId" value={invitationId} />
          <button type="submit" className="secondary" disabled={busy} aria-label={`Cancel Invitation to ${email}`}>
            Cancel
          </button>
        </form>
      </div>
      <Messages state={resendState} />
      <Messages state={cancelState} />
    </div>
  );
}
