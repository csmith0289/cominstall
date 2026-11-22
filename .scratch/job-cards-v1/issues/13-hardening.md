# 13: Hardening

**What to build:** Access tests for every entry point, CSV export, and real iPhone Safari testing.

**Blocked by:** 09, 10

**Status:** blocked

- [ ] A test for every page, server action and route handler proves an Engineer can't reach another Engineer's data and a non-Admin can't reach Admin features.
- [ ] Admins can download the filtered Job Card list as CSV (Reg, date, Customer, Engineer, Status, mileage, Work Carried Out, Parts Used).
- [ ] A Playwright WebKit project runs the phone specs as iPhone Safari.
- [ ] Daily Neon backups are confirmed on, and restoring one is written up in `docs/deploy.md`.
- [ ] Dependencies copied from Batch & Label but unused (e.g. `jpeg-js`, `pngjs`, `@pdf-lib/fontkit`) are removed if nothing needs them.
