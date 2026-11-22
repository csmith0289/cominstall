# 06: Admin Job Cards

**What to build:** The Admin dashboard and the list of every Job Card, with reopen and reassign.

**Blocked by:** 05

**Status:** blocked

- [ ] Admin dashboard: counts of Outstanding, Complete in the last 7 days, and Drafts older than 7 days, each linking to the filtered list.
- [ ] All Job Cards list: filters for Status, Engineer, Customer, date range and Reg; search; 50 per page; filters kept in the URL.
- [ ] An Admin can open and edit any Job Card that isn't Complete.
- [ ] Reopen (Complete → Outstanding) and Reassign (to another active Engineer), each with a reason, written to the Audit Log and shown on the Job Card.
- [ ] Engineers get a 404 on every `/admin` URL.
- [ ] E2E for filters, reopen and reassign.
