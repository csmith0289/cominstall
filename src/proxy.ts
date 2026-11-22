import { NextResponse, type NextRequest } from "next/server";

// An internal app: every response asks search engines not to index it.
export function proxy(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
