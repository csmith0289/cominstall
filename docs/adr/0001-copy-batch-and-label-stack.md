# 1. Copy the Batch & Label stack into a separate repo

Date: 2026-11-22. Status: accepted.

## Context

Com-Install needs a small job card app quickly. The user already runs Batch & Label (`csmith0289/foodLabels`) on Next.js, Better Auth, Drizzle, Neon, Netlify and a local ticket loop, and knows how to operate it.

## Decision

Start `cominstall` from a copy of Batch & Label's setup (config, `src/db`, `src/auth`, `src/email`, test setup, scripts, agent docs and skills), with everything bakery-specific removed. Keep it a **separate** repo, Netlify site, Neon project and set of accounts. Nothing is shared at runtime.

## Consequences

- Fixes and improvements to the shared patterns must be copied by hand between the two repos.
- Com-Install's data never sits next to Batch & Label's, which keeps the NDA and data processing agreement simple.
- The first ticket inherits Batch & Label's lockfile and must make it green here.
