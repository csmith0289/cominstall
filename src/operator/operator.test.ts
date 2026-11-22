import { describe, expect, it } from "vitest";
import { isOperator } from "./index";

describe("isOperator", () => {
  const confirmed = { email: "dev@example.test", emailVerified: true };

  it("is a confirmed account listed in OPERATOR_EMAILS", () => {
    expect(isOperator(confirmed, "other@example.test, DEV@example.test")).toBe(true);
  });

  it("isn't an unconfirmed account, an unlisted one, or anyone when the list is unset", () => {
    expect(isOperator({ ...confirmed, emailVerified: false }, "dev@example.test")).toBe(false);
    expect(isOperator(confirmed, "other@example.test")).toBe(false);
    expect(isOperator(confirmed, undefined)).toBe(false);
    expect(isOperator(null, "dev@example.test")).toBe(false);
  });
});
