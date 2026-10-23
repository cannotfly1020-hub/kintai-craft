import type { NextConfig } from "next";

/** Electron 向け静的エクスポート（basePath なし） */
const desktop = process.env.KINTAI_DESKTOP === "1";
/** GitHub Pages 向け静的エクスポート（/kintai-craft サブルート） */
const pages = process.env.GITHUB_PAGES === "1";
const staticExport = desktop || pages;

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
        ...(pages
          ? {
              basePath: "/kintai-craft",
              assetPrefix: "/kintai-craft/",
            }
          : {}),
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
