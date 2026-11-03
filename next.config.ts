import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  allowedDevOrigins: ["192.168.1.129"],
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
