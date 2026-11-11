import type { MetadataRoute } from "next";

// Forbid everything. Never list any URL here (especially not the secret link).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
