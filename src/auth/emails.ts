import type { Email } from "@/email";

// The account emails: short plain text, the one link, nothing that tracks.

export function passwordResetMessage(link: string): Omit<Email, "to"> {
  return {
    subject: "Choose a new password for Com-Install Job Cards",
    text: [
      "Hello,",
      "",
      "Someone asked to reset the password for your Com-Install Job Cards account. To choose a new password, open this link:",
      "",
      link,
      "",
      "The link works once, for 1 hour. If you didn't ask for this, ignore this email and your password stays the same.",
      "",
      "Com-Install Job Cards",
    ].join("\n"),
  };
}

export function confirmEmailMessage(link: string): Omit<Email, "to"> {
  return {
    subject: "Confirm your email address for Com-Install Job Cards",
    text: [
      "Hello,",
      "",
      "Please confirm this is your email address, so you can use Com-Install Job Cards:",
      "",
      link,
      "",
      "The link works for 1 hour. If you didn't create an account, ignore this email.",
      "",
      "Com-Install Job Cards",
    ].join("\n"),
  };
}
