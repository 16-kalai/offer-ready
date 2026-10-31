import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Recorded answers travel as base64 in server actions (a 3-minute answer is ~2 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
