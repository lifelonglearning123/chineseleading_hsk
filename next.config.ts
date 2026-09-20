import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The CC-CEDICT and HSK JSON files are read from disk at runtime, so they
  // must be traced into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },
};

export default nextConfig;
