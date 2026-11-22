// What someone holding an invitation link that no longer works is told.
export function invitationLinkMessage(state: "expired" | "used"): string {
  return state === "expired"
    ? "This invitation link has expired. Invitation links work for 7 days. Contact an Admin at Com-Install and ask them to send you a new one."
    : "This invitation link has already been used or is no longer valid. If you already have an account, sign in. Otherwise, contact an Admin at Com-Install and ask them to send you a new Invitation.";
}
