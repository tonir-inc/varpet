import { defineConfig, loadEnv } from "vite";
import { catalogPlugin } from "./server/catalog.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VARPET_");
  return {
    plugins: [catalogPlugin({ url: env.VARPET_CATALOG_URL })],
    server: { port: 5173, fs: { allow: ["../.."] } },
  };
});
