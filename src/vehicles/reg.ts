// A Reg is stored upper case with spaces, dashes and dots removed ("ab12 cde" → "AB12CDE"), so the same Vehicle is
// always found however it was typed, and shown with the usual space.

export function normaliseReg(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Current-style GB marks (two letters, two digits, three letters) get the space before the last three characters.
// Anything else (older, private or foreign marks) is shown as stored.
export function displayReg(reg: string): string {
  const normalised = normaliseReg(reg);
  return /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(normalised) ? `${normalised.slice(0, 4)} ${normalised.slice(4)}` : normalised;
}
