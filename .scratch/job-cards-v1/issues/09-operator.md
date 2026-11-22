# 09: Operator area

**What to build:** The hidden support area for the app's developer.

**Blocked by:** 06, 08

**Status:** blocked

- [ ] `/operator` works only for a confirmed account whose email is in `OPERATOR_EMAILS`; everyone else gets a 404 and never sees a link.
- [ ] Shows Users, Invitations, Job Cards (with filters), Vehicles, Customers and the Audit Log.
- [ ] The Operator can resend an Invitation, fix a Role, reactivate a User, reopen or reassign a Job Card; nothing else. Each change is written to the Audit Log marked as an Operator change.
- [ ] Admins can't remove or change the Operator from inside the app.
- [ ] The Operator's own account doesn't appear in the Admin's user list.
