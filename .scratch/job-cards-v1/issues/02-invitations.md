# 02: Invitations

**What to build:** An Admin invites a User by email with a Role. The invitee gets an email with a link, sets their name and password, and is signed in.

**Blocked by:** 01

**Status:** blocked

- [ ] Admin → Users → Invite: email and Role (Engineer or Admin). Refuses an email that already has an account or a pending Invitation, with a message.
- [ ] The invitation email names Com-Install, the Role, and a link valid for 7 days.
- [ ] Opening the link shows a form for name and password; submitting creates the account with that Role, marks the email confirmed, and signs them in.
- [ ] An expired or used link shows a clear message and asks them to contact an Admin.
- [ ] An Admin can resend or cancel a pending Invitation.
- [ ] Inviting, resending, cancelling and accepting are written to the Audit Log.
- [ ] E2E: the Admin invites an Engineer, the Engineer accepts from the outbox email on a phone-sized screen.
