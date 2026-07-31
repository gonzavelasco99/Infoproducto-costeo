import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@costeo/domain", "@costeo/contracts"]
};

export default nextConfig;
