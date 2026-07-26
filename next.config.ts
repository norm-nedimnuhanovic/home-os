import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project — an unrelated stray lockfile in
  // a parent directory otherwise makes Next.js guess the wrong root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
