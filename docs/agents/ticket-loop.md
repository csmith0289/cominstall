# Ticket loop: building job-cards-v1 unattended

**The loop runs locally**, as on Batch & Label: **one agent at a time, one ticket at a time.** Finish the current ticket (dev, PO review, QA, landed and closed) before picking the next, and never run two agents on tickets at once. Run the suite and `scripts/land-pr.sh` on the local machine, then commit and push from there. `scripts/ticket-loop.ps1` runs one iteration at a time, each in a fresh `claude -p` session, on the user's machine (msi). There are no GitHub Actions (the user won't pay for them), and CI on GitHub isn't required while it doesn't run: a green local `bash scripts/check.sh` counts. Merge PRs with `bash scripts/land-pr.sh <n>`.

One **iteration** of this file moves **one ticket** through **one gate** of `definition-of-done.md`, then ends. Don't stop to ask a question. Record it on the brief issue and carry on.

Read first, every iteration: `CLAUDE.md`, `docs/agents/definition-of-done.md`, `docs/agents/issue-tracker.md`, `GLOSSARY.md`, the **brief issue** (the open issue labelled `brief`), and the newest comment on the brief issue headed `Stand-up` (see **Daily stand-up** below). Treat the stand-up's **Today** and **Blockers** as context for this iteration; the order below and comments from `csmith0289` still win.

## Goal and order

The goal is the Com-Install Job Cards app in `.scratch/job-cards-v1/spec.md`, running on Netlify with Neon, usable on iPhone and Android. Work tickets in this order (ticket `NN`, as in the issue title):

1. **01** Foundation. Its first job is to make the copied foundation green: `pnpm install` (the lockfile came from Batch & Label), `pnpm db:generate --name init` for the first migration, then typecheck, unit tests and e2e.
2. **02** Invitations, then **03**, **04**, **05**: an Engineer can create, list, complete and share Job Cards. This is the first usable product.
3. **06**, **07**, **08**: Admin.
4. **11** terms and privacy, **10** offline drafts, **09** Operator.
5. **12**: deploy to Netlify and Neon. **Needs the user** for accounts and secrets: prepare everything, then label it `needs-info` with the exact steps.
6. **13** hardening, last.

## One iteration

1. **Unblock.** For each open `ticket` labelled `blocked`, if every issue in its *Blocked by* line is closed, swap `blocked` for `ready-for-agent`.
2. **Pick.** If a ticket is labelled `in-progress`, continue it. Otherwise take the first ticket in the order above labelled `ready-for-agent`. Label it `in-progress` and `gate: dev`, and remove `ready-for-agent`. If nothing is pickable, go to step 6.
3. **Do the ticket's current gate, and only that gate**, exactly as `definition-of-done.md` describes:
   - **`gate: dev`.** Work on branch `ticket-NN-<slug>` from up-to-date `master`, or the ticket's existing branch. Work test-first until it's green. Push. Open or update one PR whose body says `Closes #<ticket>`, plus `Fixes #<bug>` for each bug fixed. Run `bash scripts/check.sh` and record the green run on the PR (GitHub CI doesn't run). When it's green, set `gate: po-review`.
   - **`gate: po-review`.** Run the PO review in a **fresh subagent**, with only the ticket, spec, glossary and ADRs as context. Post its verdict as an issue comment headed `PO review`. If there are no findings, set `gate: qa`. Otherwise set `gate: dev` and list the findings.
   - **`gate: qa`.** Run QA in a **fresh subagent** that starts the app (`pnpm build && pnpm start`) and drives it with Playwright as an Engineer, a second Engineer, an Admin and the Operator, on desktop and phone-sized screens. Post the result as a comment headed `QA`. File each defect as its own issue labelled `qa` and `needs-triage`, and link it from the ticket. With no findings, go to **Done**. Otherwise set `gate: dev`.
4. **Done.** Tick the acceptance boxes in the issue body. Land the PR with `bash scripts/land-pr.sh <n>`. It merges up-to-date `master` into the branch, regenerates the ticket's Drizzle migration after master's latest (so two tickets never ship clashing migration numbers), reruns the full suite, and merges with a merge commit. If it exits 2 (code conflicts, or a hand-written migration), resolve them on the ticket branch: merge `master` in, keep both sides' features, take master's `drizzle/` as it is and regenerate the ticket's migration with `pnpm db:generate --name <name>` (never renumber or edit master's migrations), get the suite green, and run it again. If it exits 1 (red suite, failed merge or failed generate), nothing was pushed: send the ticket back to `gate: dev` with the output, or log it as a blocker if it is environmental. Then run `bash scripts/check.sh` on up-to-date `master`. If it fails, revert the merge in a new PR, merge that, and send the ticket back to `gate: dev`. When it's green, remove `in-progress` and the gate label, and make sure the issue is closed.
5. **Bounce limit.** If a ticket has gone back to `gate: dev` three times, label it `needs-info`, remove `in-progress`, and explain why on the brief issue. Then move on.
6. **Brief.** Update the brief issue (see below), including **Blockers**: add any blocker you hit this iteration and remove any that are now cleared. If every ticket in the order is closed or `needs-info`, put `ALL IN-SCOPE TICKETS DONE` as the first line of the brief and add the label `loop: stop` to it. The local runner stops when the brief has that label.

## Rules

- **Green** means `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` all pass from a clean install on the local machine (`bash scripts/check.sh`). CI on the PR counts too once it runs, but isn't required while it doesn't. In `gate: dev`, skip the `gh pr checks --watch` wait when no checks start, and record the local run on the PR instead. Never mark a gate passed on a red suite. Never weaken, skip or delete a test to get green.
- Commit small. Push after every commit. Never force-push `master` or rewrite pushed history. Rebasing a ticket branch onto `master` and force-pushing that branch with `--force-with-lease` is fine.
- **Anything that needs the user** (an account, a secret, a product decision not recorded below): label that ticket `needs-info`, put the question on the brief issue with a recommended answer, and carry on with other tickets.
- **Log blockers as you hit them**, in the same iteration, under **Blockers** on the brief: a `needs-info` label, a bounce back to `gate: dev`, a red suite you couldn't fix, CI not running, a tool or environment failure, or anything that will slow the next iteration. A blocker is a note for the user and the next iteration, never a reason to stop.
- **Timestamps:** take them from `date -u '+%Y-%m-%d %H:%M UTC'` at the moment you write them. Never estimate the time.
- **The user may comment on issues** from their phone. Before working a ticket, read its newest comments. A comment from `csmith0289` overrides this file.
- No secrets in commits, issues or logs. Never put real Com-Install customer data in tests, fixtures or issues: invent it.
- Everything about Com-Install's data is confidential (the user has an NDA with Com-Install). Don't quote real data anywhere outside the app.

## Decisions already made by the user (2026-11-22)

- **Separate repo and data:** nothing is shared with Batch & Label (`csmith0289/foodLabels`) except copied code patterns. Separate Netlify site, Neon project and accounts.
- **Login:** Better Auth email + password with email confirmation and password reset, as in Batch & Label.
- **Sign-ups:** invite-only for good. An Admin invites Engineers and Admins. The first Admin comes from `ADMIN_EMAILS`.
- **Operator:** the user's own support account, from `OPERATOR_EMAILS`, confirmed email only, invisible to everyone else, can't be removed from inside the app. Every Operator change goes in the Audit Log.
- **No Stripe, no multiple companies:** the app is for Com-Install Ltd only.
- **Vehicles link Job Cards to Parts:** filtering by reg shows every Job Card and every Part fitted, via `customers → vehicles → job_cards → job_card_parts`. No direct reg-to-parts table.
- **Statuses:** Draft, Outstanding, Complete. Ask before adding more.
- **Job Card PDF** follows the paper card's layout (logo, REG / DATE / CUSTOMER / MILEAGE grid, lined work description, QTY / PART / PART NO. table) and is sent from the phone's share menu, so it works on iPhone.
- **Merging:** merge to `master` automatically once dev, PO review and QA pass and the local suite is green.

## The brief issue

The brief issue is the open issue labelled `brief`. The user reads it on their phone, so keep its body short and current. Edit the body; don't add comments (the daily stand-up comment is the only comment, and it isn't yours to write):

- **Top:** three lines. How many tickets are closed out of 13 (01–13). Which ticket is in progress and at which gate, with its PR link. Anything waiting on the user.
- **Needs you:** one line per question, each with a recommended answer.
- **Blockers:** one line per open blocker, in the form `#issue NN · what is blocked · since YYYY-MM-DD HH:MM UTC · what unblocks it`. Delete a line once it's cleared. Write `None` when there are none.
- **Log:** one line per iteration, newest first, in the form `YYYY-MM-DD HH:MM UTC · #issue NN · gate · result`. Keep the latest 30 lines.

## Daily stand-up

Every morning a scheduled task, not the loop, posts a comment on the brief issue headed `Stand-up · YYYY-MM-DD`, built from the Log, Blockers and Needs you. It has **Yesterday** (what moved in the last 24 hours), **Today** (what's next in the order), **Blockers**, **Needs you**, a one-line **Retro** (what went well, what slowed us) and **Loop health**. Read the newest one at the start of each iteration. Don't edit or reply to it; if it's wrong, fix the brief body and the next stand-up will follow.
