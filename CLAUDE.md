# Com-Install Job Cards

A mobile web app for Com-Install Ltd: Engineers fill in Job Cards on their phones, Admins track them to Complete. Spec: `.scratch/job-cards-v1/spec.md`. Built the same way as Batch & Label (`csmith0289/foodLabels`), but a separate app with its own data (`docs/adr/0001`).

## Resuming work

Start every new session with `RESUME.md`: where progress is tracked (the `brief` issue), how to restart the loop, and how to pick up by hand.

## Confidentiality

The user works for Com-Install under an NDA. Never put real Com-Install data (customers, regs, staff, job details) in code, tests, fixtures, issues, PRs or logs. Invent test data. No secrets in the repo.

## Agent skills

### Issue tracker

Tickets and bugs are GitHub Issues on `csmith0289/cominstall`. See `docs/agents/issue-tracker.md`. The unattended build loop is `docs/agents/ticket-loop.md`.

### Definition of done

Before marking a ticket done, it passes the dev loop, a PO review and QA. See `docs/agents/definition-of-done.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
