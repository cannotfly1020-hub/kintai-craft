import type { NextConfig } from "next";

/** Tauri / 静的エクスポート用ビルド時に CLI が付与する */
const desktop = Boolean(process.env.TAURI_ENV_PLATFORM) || process.env.KINTAI_DESKTOP === "1";

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
