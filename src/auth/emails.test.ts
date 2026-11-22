import { describe, expect, it } from "vitest";
import { confirmEmailMessage, passwordResetMessage } from "./emails";

const link = "https://jobcards.example.test/reset-password?token=abc";

describe.each([
  ["password reset", passwordResetMessage],
  ["email confirmation", confirmEmailMessage],
])("the %s email", (_name, message) => {
  it("is short plain text in the brand's voice, with the one link and nothing that tracks", () => {
    const { subject, text } = message(link);
    expect(subject).toMatch(/Com-Install Job Cards/);
    expect(text).toContain(link);
    expect(text).toContain("1 hour");
    expect(text).not.toMatch(/<[a-z]/i);
    // The link is the only URL: no tracking pixels or redirects.
    expect(text.match(/https?:\/\//g)).toHaveLength(1);
    expect(text.split("\n").length).toBeLessThan(15);
  });
});

it("says the reset link works only once", () => {
  expect(passwordResetMessage(link).text).toMatch(/works once/);
});
