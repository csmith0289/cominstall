import type { Role } from "@/db/schema";
import type { Email } from "@/email";

const ROLE_NAMES: Record<Role, string> = { engineer: "an Engineer", admin: "an Admin" };

// The invitation email: short plain text, the one link, nothing that tracks.
export function invitationMessage(link: string, role: Role): Omit<Email, "to"> {
  return {
    subject: "You're invited to Com-Install Job Cards",
    text: [
      "Hello,",
      "",
      `Com-Install Ltd has invited you to use Com-Install Job Cards as ${ROLE_NAMES[role]}. To set your name and password, open this link:`,
      "",
      link,
      "",
      "The link works once, for 7 days. If it has expired, ask an Admin at Com-Install to send a new one. If you weren't expecting this, ignore this email.",
      "",
      "Com-Install Job Cards",
    ].join("\n"),
  };
}
