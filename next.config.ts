import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    // Disable Turbopack filesystem cache to avoid corrupted database issues
    turbopackFileSystemCacheForDev: false,
    // Optimize package imports for better performance
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
};

export default nextConfig;
