import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Heavy native deps must not be bundled into serverless/edge output.
  serverExternalPackages: ["bullmq", "ioredis", "sharp", "playwright"],
  images: {
    // Allow remote listing photos (served from S3 / CDN) to be optimised.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
