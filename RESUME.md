# Resume here

Start here when you pick cominstall up again, from a new Claude session, a new day or a different machine. Nothing important lives inside a Claude session.

## Where the state lives

| What | Where | Who updates it |
| --- | --- | --- |
| Progress, Needs you, Blockers, Log | The open issue labelled `brief` | The loop, every iteration |
| Each ticket's status and gate | Labels on the `ticket` issues | The loop |
| Each ticket's code | Branch `ticket-NN-<slug>` and its PR | The loop |
| Work order, rules and your decisions | [`docs/agents/ticket-loop.md`](docs/agents/ticket-loop.md) | You (or a session you ask) |
| Your instructions on a ticket | Your comments on that issue. They override the runbook. | You |

## First time only

1. Make sure the Claude GitHub app can access this repo.
2. Create the labels, the brief and the 13 ticket issues: `bash scripts/seed-issues.sh` (needs `gh` signed in). Done on 2026-11-22.
3. Start the loop (below). Ticket 01 makes the copied foundation green first: the scaffold was written where packages couldn't be installed, so it has never been run.

## Start or resume the loop (on msi)

1. Check the brief has no `loop: stop` label, and there's no `STOP` file in the repo root.
2. In a PowerShell window in the repo, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\ticket-loop.ps1
   ```

3. Leave the window open. It stops by itself when the brief gets `loop: stop`, a `STOP` file appears, or no ticket is `in-progress` or `ready-for-agent`.

**Pause:** add the `loop: stop` label to the brief. It finishes the current iteration first.

## Resume in an interactive Claude session

Start the session in this repo and say:

> Read RESUME.md, then the brief issue and its newest stand-up, and tell me where we are.

If you work a ticket by hand, stop the loop first so two agents never work at once, and leave the labels and the brief as the loop would.

## Snapshot (2026-11-22)

- Scaffold, spec, glossary, ADRs pushed. Brief is #1; tickets 01–13 are #2–#14 (01 `ready-for-agent`, the rest `blocked`). Nothing run yet.
- Next: start the loop on msi for ticket 01 (#2).
- Legal: the agreement (NDA + data processing), terms of use and privacy notice are drafted outside the repo; ticket 11 puts the final terms and privacy text into the app.
