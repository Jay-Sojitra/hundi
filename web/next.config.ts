import type { NextConfig } from "next";

// All screens read live chain data in the browser, so there is nothing to prerender or cache.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
