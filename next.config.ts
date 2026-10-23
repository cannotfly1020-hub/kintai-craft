import type { NextConfig } from "next";

/** Electron / 静的エクスポート用ビルド時 */
const desktop = process.env.KINTAI_DESKTOP === "1";

const nextConfig: NextConfig = {
  ...(desktop
    ? {
        output: "export" as const,
        images: { unoptimized: true },
      }
    : {
        serverExternalPackages: ["exceljs"],
        cacheComponents: true,
        partialPrefetching: true,
      }),
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
