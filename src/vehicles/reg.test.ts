import { describe, expect, it } from "vitest";
import { displayReg, normaliseReg } from "./reg";

describe("normaliseReg", () => {
  it.each([
    ["ab12 cde", "AB12CDE"],
    [" AB12-CDE ", "AB12CDE"],
    ["a b 1 2 c d e", "AB12CDE"],
    ["K123 ABC", "K123ABC"],
    ["", ""],
  ])("turns %j into %j", (input, expected) => {
    expect(normaliseReg(input)).toBe(expected);
  });
});

describe("displayReg", () => {
  it("puts the space in a current-style mark", () => {
    expect(displayReg("AB12CDE")).toBe("AB12 CDE");
    expect(displayReg("ab12cde")).toBe("AB12 CDE");
  });

  it("leaves other marks as stored", () => {
    expect(displayReg("K123ABC")).toBe("K123ABC");
    expect(displayReg("1ABC")).toBe("1ABC");
  });
});
