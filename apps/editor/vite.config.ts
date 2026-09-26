import { defineConfig, loadEnv } from "vite";
import { catalogPlugin } from "./server/catalog.mjs";
import { sharingPlugin } from "./server/sharing";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VARPET_");
  return {
    plugins: [sharingPlugin({ directory: env.VARPET_SHARES_DIR, publicOrigin: env.VARPET_PUBLIC_ORIGIN }), catalogPlugin({ url: env.VARPET_CATALOG_URL })],
    server: { port: 5173, fs: { allow: ["../.."] } },
  };
});
