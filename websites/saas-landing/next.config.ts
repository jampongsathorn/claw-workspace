import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandbox preview proxy hosts to load dev assets.
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev", "*.arena.ai"],
};

export default nextConfig;
