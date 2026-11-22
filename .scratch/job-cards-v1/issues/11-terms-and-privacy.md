# 11: Terms of use and privacy notice

**What to build:** The terms of use and privacy notice pages, and accepting the terms at first sign-in.

**Blocked by:** 01

**Status:** blocked

- [ ] `/terms` and `/privacy` show the text from the user's agreed draft (ask the user for the final text; until then use the draft with a DRAFT banner).
- [ ] Both are linked from the sign-in page and the footer.
- [ ] A User who hasn't accepted the current terms version is asked to tick and accept before anything else; the version and time are stored and written to the Audit Log.
- [ ] Bumping `TERMS_VERSION` asks everyone again.
- [ ] The Job Card PDF footer links to the privacy notice.
