import type { NextConfig } from "next";

// Prices are fetched live on every request and cached in lib/gemini.ts,
// so the framework's component cache stays off.
const nextConfig: NextConfig = {};

export default nextConfig;
