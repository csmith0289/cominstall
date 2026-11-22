# Spec: Job Cards v1

Status: ready-for-agent

## Problem Statement

Com-Install Ltd fits and services commercial vehicles. Engineers record each job on a paper job card: Reg, Date, Customer, Mileage, the Work Carried Out and the Parts Used. Paper cards get lost, can't be searched by Reg, and the office can't see which jobs are still outstanding.

A stop-gap single HTML page (`docs/reference/job-card-v0.html`) lets an Engineer fill the card on a phone and share it as a PDF, but each card lives only on that phone: no one else can see it, and nothing tracks its Status.

## Solution

A mobile web app, added to the home screen on iPhone and Android:

- Engineers sign in, fill in Job Cards on their phone (the same layout as the paper card), and mark them Complete, which builds the Job Card PDF and opens the phone's share menu to email it.
- Every Job Card is stored against a Vehicle (by Reg) and its Customer, so the Vehicle History shows every job and every Part Used on that Vehicle.
- Admins see every Job Card, filter by Status, Engineer, Customer, date and Reg, reassign or reopen Job Cards, and invite and manage Users.
- The Operator (the app's developer) has a hidden support area to fix problems, with every change in the Audit Log.
- Sign-ups are invite-only. The app is for Com-Install only: no billing, no other companies.

## User Stories

### Accounts

1. As an Admin, I want to invite an Engineer by email, so that only Com-Install staff can use the app.
2. As an invited Engineer, I want to set my own password from the invitation email, so that I can sign in.
3. As a User, I want to reset a forgotten password myself, so that I'm not locked out on a job.
4. As an Admin, I want to change a User's Role or deactivate them when they leave, so that former staff lose access straight away.
5. As Luke Smith, I want to become the first Admin without anyone inviting me, so that the app can be set up (`ADMIN_EMAILS`).

### Job Cards (Engineer)

6. As an Engineer, I want to start a new Job Card with today's date filled in, so that it's quick on a job.
7. As an Engineer, I want typing a Reg to suggest Vehicles we've seen before and fill in the Customer, so that I don't retype details or create duplicates.
8. As an Engineer, I want to add a new Vehicle and Customer from the Job Card when the Reg is new, so that I'm never blocked.
9. As an Engineer, I want to enter the mileage, the Work Carried Out and any number of Parts Used, so that the card is complete.
10. As an Engineer, I want my Job Card saved as I type, and kept on my phone when there's no signal, so that I never lose work.
11. As an Engineer, I want to see My Jobs grouped by Draft, Outstanding and Complete, newest first, so that I know what's left.
12. As an Engineer, I want to submit a Job Card as Outstanding when the work isn't finished, so that the office knows.
13. As an Engineer, I want to mark a Job Card Complete and share its PDF from my phone (Mail, Gmail, WhatsApp, Save to Files), so that the customer and office get it.
14. As an Engineer, I want to look up a Reg and see my own past Job Cards for that Vehicle, so that I know what I did last time.
15. As an Engineer, I must not be able to see or change another Engineer's Job Cards, even by changing a URL.

### Admin

16. As an Admin, I want a dashboard with counts of Outstanding Job Cards, Complete this week and Drafts older than 7 days, so that I can chase work.
17. As an Admin, I want to list all Job Cards with filters for Status, Engineer, Customer, date range and Reg, so that I can find any job.
18. As an Admin, I want a Vehicle page with every Job Card and every Part Used on it, so that I can answer customer and warranty questions.
19. As an Admin, I want a Customer page with their Vehicles and Job Cards, so that I can see a fleet's work.
20. As an Admin, I want to reopen a Complete Job Card or reassign one to another Engineer, so that mistakes can be fixed; each change goes in the Audit Log.
21. As an Admin, I want to edit and merge Customers and Vehicles, so that duplicates and changed private plates can be tidied.
22. As an Admin, I want to download the filtered list as CSV and any Job Card PDF, so that I can use it in other tools.

### Operator

23. As the Operator, I want a hidden `/operator` area showing all Users, Job Cards, Vehicles and the Audit Log, so that I can support Com-Install.
24. As the Operator, I want to resend an invitation, fix a Role, reactivate a User, and reopen or reassign a Job Card, each recorded in the Audit Log, so that I can fix problems without database access.
25. As the Operator, I must not be removable from inside the app, so that Com-Install can't lock out support by accident.

### Legal

26. As a User, I want to read the terms of use and privacy notice and accept the terms the first time I sign in, so that responsibilities are clear.

## Implementation Decisions

- **Stack:** copied from Batch & Label (`csmith0289/foodLabels`): Next.js 16, React 19, TypeScript, pnpm, Better Auth (email + password, email confirmation, password reset), Drizzle ORM on Neon Postgres in London, PGlite for development and tests, Resend for email, `pdf-lib` for PDFs, Vitest and Playwright. Netlify hosting. See `docs/adr/0001`.
- **Data model:** `user` (+ `role`, `deactivated_at`, `terms_version`, `terms_accepted_at`), `invitations`, `customers`, `vehicles` (unique normalised `reg`), `job_cards` (`vehicle_id`, `engineer_id`, `job_date`, `mileage`, `work_carried_out`, `status`, `submitted_at`, `completed_at`), `job_card_parts` (`job_card_id`, `position`, `quantity`, `part`, `part_number_or_notes`), `audit_log`. A Job Card's Customer is its Vehicle's Customer at the time; store `customer_id` on the Job Card too, so a Vehicle changing hands doesn't rewrite history.
- **Access** is enforced on the server in one place per area: every page, server action and route handler starts from `requireUser()`, `requireAdmin()` or `requireOperator()` in `src/app/session.ts`, and every Job Card query for an Engineer is scoped to `engineer_id`. Not just hidden links.
- **Reg** is normalised to upper case with spaces and dashes removed before saving or searching. `src/vehicles/reg.ts` owns this.
- **Statuses:** `draft → outstanding → complete`, and `draft → complete` directly. Admins (and the Operator) can reopen `complete → outstanding`. An Engineer can edit their own Job Card while it isn't Complete.
- **Job Card PDF** is built on the server with `pdf-lib`, A4, laid out like the paper card (see `docs/reference/job-card-v0.html` and the Com-Install logo in `public/`). The phone shares it with the Web Share API (`navigator.share({ files })`); where that isn't available it opens the PDF in a new tab. The v0 page shows the working pattern for iPhone.
- **Offline:** a service worker caches the app shell; a Job Card being edited is kept in `localStorage` (wrapped in try/catch) and synced when the connection returns. Server wins on conflict only for Status changes made by an Admin.
- **Operator** works as in Batch & Label (`OPERATOR_EMAILS`, confirmed email, 404 for everyone else), but can make the support changes in story 24.
- **No Stripe, no multi-company.**

## Testing Decisions

- Unit tests (Vitest, PGlite) for every module: access rules (an Engineer never gets another Engineer's Job Card from any function), Reg normalisation, Status transitions, Audit Log entries, invitation rules.
- E2E (Playwright) for each story on desktop and on iPhone- and Android-sized screens (`*.phone.spec.ts`).
- Ticket 13 adds a real WebKit project for iPhone Safari.
- Test data is invented. Never use real Com-Install customer data.

## Out of Scope

- Billing, invoicing, quotes and pricing.
- Other companies using the app.
- Native apps (it's a web app added to the home screen).
- Photos on Job Cards (a possible v2).
- Customer sign-off signatures (a possible v2).

## Tickets

| # | Ticket | Blocked by |
| --- | --- | --- |
| 01 | Foundation: copied setup green, schema, Roles, invite-only sign-up, app shell | – |
| 02 | Invitations: Admin invites a User, invitee sets a password | 01 |
| 03 | New Job Card: form, Reg lookup, new Vehicle and Customer, Parts Used, autosave | 01 |
| 04 | My Jobs: list by Status, open, edit, submit as Outstanding | 03 |
| 05 | Complete and share: Status Complete, Job Card PDF, share menu | 04 |
| 06 | Admin Job Cards: dashboard, list with filters, reopen, reassign | 05 |
| 07 | Vehicle and Customer pages, Vehicle History, edit and merge | 06 |
| 08 | Manage Users: change Role, deactivate, reactivate | 02 |
| 09 | Operator area | 06, 08 |
| 10 | Offline drafts and home-screen install | 04 |
| 11 | Terms of use and privacy notice pages, acceptance at first sign-in | 01 |
| 12 | Deploy to Netlify and Neon (needs the user) | 05 |
| 13 | Hardening: access tests for every entry point, CSV export, WebKit e2e | 09, 10 |
