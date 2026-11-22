# Issue tracker: GitHub Issues

Tickets, bugs and their history live as GitHub Issues on `csmith0289/cominstall`. Use the `gh` CLI. Specs stay in the repo as `.scratch/<feature>/spec.md`.

## Conventions

- **A ticket** is an issue labelled `ticket`, titled `NN: <name>` (the number from the spec's ticket list). Its body holds *What to build*, *Blocked by* (issue links) and the acceptance checkboxes.
- **A bug** found by QA is an issue labelled `qa` and `needs-triage`, linked from the ticket it was found on.
- **Status** is a label, exactly one of: `ready-for-agent`, `in-progress`, `blocked`, `needs-info`, `ready-for-human`, `wontfix`. Done means the issue is **closed** (as completed).
- **Gate** (only while `in-progress`): one of `gate: dev`, `gate: po-review`, `gate: qa`. See `definition-of-done.md`.
- **Comments and conversation history** are issue comments. Reviews are headed `PO review` or `QA`.
- **Code** for a ticket goes on branch `ticket-NN-<slug>` with one pull request whose body says `Closes #<ticket issue>` and `Fixes #<bug>` for each bug it fixes.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `gh issue create`, labelled as above.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`. The user will normally pass the issue number or the ticket's `NN`.

## Blocking

A ticket is unblocked when every issue in its *Blocked by* line is closed. When a ticket closes, swap `blocked` for `ready-for-agent` on any ticket that is now unblocked.
