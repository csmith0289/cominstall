import { describe, expect, it } from "vitest";
import { invitationLinkMessage } from "./messages";

describe("invitationLinkMessage", () => {
  it("says an expired link lasted 7 days and to contact an Admin", () => {
    expect(invitationLinkMessage("expired")).toBe(
      "This invitation link has expired. Invitation links work for 7 days. Contact an Admin at Com-Install and ask them to send you a new one.",
    );
  });

  it("says a used link no longer works and to ask an Admin for a new Invitation", () => {
    expect(invitationLinkMessage("used")).toBe(
      "This invitation link has already been used or is no longer valid. If you already have an account, sign in. Otherwise, contact an Admin at Com-Install and ask them to send you a new Invitation.",
    );
  });
});
