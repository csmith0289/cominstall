import type { MetadataRoute } from "next";

// An internal app: keep every search engine out.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
