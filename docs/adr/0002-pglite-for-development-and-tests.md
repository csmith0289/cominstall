# 2. PGlite for development and tests (copied from Batch & Label ADR 0006)

Tests need real Postgres: the catalogue's guarantees, such as one Baker never seeing another's data and Recipe Versions being saved in one transaction, live in SQL. Running Postgres locally would mean installing it or Docker, and a shared cloud database would make tests slow and order-dependent. PGlite runs Postgres inside Node, so every test gets a fresh, fully migrated database in memory, and `pnpm dev` keeps one in a local folder.

## Consequences

- Nothing to install beyond Node and pnpm. Tests and the dev server run the same Drizzle migrations as production.
- Production uses Neon through `DATABASE_URL`. When it is set, the app uses Postgres instead of PGlite.
- Only one PGlite instance may open a data folder at a time, so the app keeps one per process (`src/db/index.ts`).
