# Deploying to Netlify with Neon

The app runs on Netlify against Neon Postgres, set up the same way as Batch & Label but with its **own** Netlify site and Neon project. Nothing is shared with Batch & Label. Without `DATABASE_URL` the app uses PGlite, so development and tests need no setup.

## First-time setup (needs your accounts)

1. **Neon:** create a new project in **AWS Europe (London), `eu-west-2`**. Copy the connection string; it must end in `?sslmode=require`.
2. **Netlify:** add a new site from the `csmith0289/cominstall` repo, production branch `master`. `netlify.toml` sets the build command.
3. In Netlify, **Site configuration → Environment variables**, add with **All scopes**:
   - `DATABASE_URL`: the Neon connection string.
   - `BETTER_AUTH_SECRET`: a long random string, from `openssl rand -base64 32`.
   - `BETTER_AUTH_URL`: the site's URL, e.g. `https://cominstall-jobcards.netlify.app`.
   - `RESEND_API_KEY` and `EMAIL_FROM`: see **Email** below. Without them no invitations, password resets or confirmation emails are sent.
   - `ADMIN_EMAILS`: Luke Smith's email (and yours only if you want an Admin account too). See **Admins** below.
   - `OPERATOR_EMAILS`: your own sign-in email. See **Operator** below.
4. Deploy. The build runs `pnpm vercel-build`, which applies the Drizzle migrations to Neon and then builds. Migrations never run at request time. The build fails, and the deploy stops, if a migration fails.

Deploy previews need the same variables pointing at a separate Neon branch, or turn them off.

## Email (Resend)

Same steps as Batch & Label (`docs/deploy.md` there), with a sender on a domain Com-Install controls, e.g. `Com-Install Job Cards <jobcards@com-install.co.uk>`. Never put the key in the repo.

## Admins

An account whose email is in `ADMIN_EMAILS` becomes an Admin when it's created. Use it once, for Luke Smith: add his email, deploy, and he signs up at `/sign-up`. After that, Admins invite Engineers and other Admins from the app, and nobody else can sign up.

## Operator

`/operator` is for you, the developer, to support Com-Install. Only an account whose email is in `OPERATOR_EMAILS` **and** confirmed can open it; everyone else gets a 404, and nobody else sees the link. It can't be granted or removed from inside the app, so Com-Install can't lock you out by accident. Every change made there is written to the Audit Log. Access is covered by the NDA and data processing agreement with Com-Install.

## Redeploying

Push or merge to `master`; Netlify builds and deploys. New migrations (`pnpm db:generate`, committed under `drizzle/`) apply during that build. To apply them by hand: `DATABASE_URL=... pnpm db:migrate`.
