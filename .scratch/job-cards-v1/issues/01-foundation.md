# 01: Foundation

**What to build:** The copied Batch & Label setup made green, plus the job-cards schema, Roles, invite-only sign-up and the app shell. The code for this was scaffolded without running it (no package installs where it was written): expect type errors and failing tests to fix first.

**Blocked by:** –

**Status:** ready-for-agent

- [ ] `pnpm install` works from the committed lockfile, or the lockfile is regenerated and committed.
- [ ] The first migration is generated with `pnpm db:generate --name init` from `src/db/schema.ts` and committed.
- [ ] Tables exist for `user` (+ `role`, `deactivated_at`, `terms_version`, `terms_accepted_at`), `invitations`, `customers`, `vehicles`, `job_cards`, `job_card_parts` and `audit_log`, as in the spec's data model.
- [ ] Sign-up is refused for any email that has no pending Invitation and isn't in `ADMIN_EMAILS`, through the form and Better Auth's API alike. With `ADMIN_EMAILS` unset, nobody can sign up without an Invitation.
- [ ] An account created from `ADMIN_EMAILS` gets Role `admin`; every other account gets the Role on its Invitation (default `engineer`).
- [ ] A deactivated User can't sign in or use an existing session.
- [ ] `requireUser()`, `requireAdmin()` and `requireOperator()` exist in `src/app/session.ts`; non-Admins get a 404 from `requireAdmin()`.
- [ ] The app shell has the Com-Install logo, "Job Cards" in the header, links for My Jobs (all Users), Admin (Admins only) and Sign out, and is usable at 390 px wide.
- [ ] Every response sends `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallows everything (an internal app).
- [ ] `bash scripts/check.sh` is green.
