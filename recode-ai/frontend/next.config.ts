import path from "node:path";
import type { NextConfig } from "next";

// The workspace is a client-rendered app that talks to the FastAPI backend
// with a bearer token, so Cache Components / partial prefetching are off.
const nextConfig: NextConfig = {
  output: "standalone",
  // this app lives inside a larger repository; keep tracing and bundling here
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
