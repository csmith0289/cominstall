import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./error-messages";

describe("authErrorMessage", () => {
  it("replaces Better Auth's wording with ours", () => {
    const error = new APIError("UNPROCESSABLE_ENTITY", {
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      message: "User already exists. Use another email.",
    });

    expect(authErrorMessage(error, "Couldn't create your account.")).toBe(
      "An account with this email already exists. Sign in instead.",
    );
  });

  it("tells an uninvited email it needs an Invitation", () => {
    const error = new APIError("FORBIDDEN", { code: "SIGNUPS_CLOSED", message: "Sign-ups are closed." });

    expect(authErrorMessage(error, "Couldn't create your account.")).toBe(
      "You need an Invitation to use Com-Install Job Cards. Ask an Admin to invite you, then open the link in your invitation email.",
    );
  });

  it("explains a malformed email in our words", () => {
    const error = new APIError("BAD_REQUEST", {
      code: "VALIDATION_ERROR",
      message: "[body.email] Invalid email address",
    });

    expect(authErrorMessage(error, "Couldn't create your account.")).toBe("Enter a valid email address.");
  });

  it("says an expired or used password reset link needs replacing", () => {
    const error = new APIError("BAD_REQUEST", { code: "INVALID_TOKEN", message: "Invalid token" });

    expect(authErrorMessage(error, "Couldn't change your password.")).toBe(
      "This link has expired or has already been used. Ask for a new one.",
    );
  });

  it("falls back to our message for anything else", () => {
    expect(authErrorMessage(new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD" }), "Email or password is incorrect.")).toBe(
      "Email or password is incorrect.",
    );
    expect(authErrorMessage(new Error("connection refused"), "Couldn't create your account.")).toBe(
      "Couldn't create your account.",
    );
  });
});
