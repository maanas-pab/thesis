import type { NextConfig } from "next";

// Prices are fetched live on every request and cached in lib/gemini.ts,
// so the framework's component cache stays off.
// "standalone" builds a self-contained server for the Docker image.
const nextConfig: NextConfig = { output: "standalone" };

export default nextConfig;
