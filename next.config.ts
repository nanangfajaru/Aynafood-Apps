import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aplikasi internal: semua halaman membaca sesi & data terbaru per request.
  cacheComponents: false,
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
