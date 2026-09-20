import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The CC-CEDICT and HSK JSON files are read from disk at runtime, so they
  // must be traced into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },

  // Next treats 127.0.0.1 as a different origin from localhost and blocks its
  // dev-client requests, which leaves the page rendered but never hydrated.
  // Allowing both means either address works during development.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
