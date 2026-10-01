import { defineConfig, loadEnv } from "vite";
import { flatsPlugin } from "./server/flats.mjs";
import { catalogPlugin } from "./server/catalog.mjs";
import { accountsPlugin } from "./server/accounts.mjs";
import { developersPlugin } from "./server/developers.mjs";
import { experimentalPlugin } from "./server/experimental.mjs";
import { sharingPlugin } from "./server/sharing";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VARPET_");
  return {
    plugins: [flatsPlugin({ base: env.VARPET_FLATS_URL, url: env.VARPET_CATALOG_URL, origin: env.VARPET_APP_ORIGIN }), accountsPlugin({ dataDir: env.VARPET_DATA_DIR, origin: env.VARPET_APP_ORIGIN }), developersPlugin({ dataDir: env.VARPET_DATA_DIR, origin: env.VARPET_APP_ORIGIN }), sharingPlugin({ directory: env.VARPET_SHARES_DIR, publicOrigin: env.VARPET_PUBLIC_ORIGIN }), catalogPlugin({ url: env.VARPET_CATALOG_URL }), experimentalPlugin()],
    preview: { host: "127.0.0.1", port: 4173, strictPort: true, allowedHosts: env.VARPET_PUBLIC_ORIGIN ? [new URL(env.VARPET_PUBLIC_ORIGIN).hostname] : [] },
    server: { port: 5173, fs: { allow: ["../.."], deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.varpet/**', '**/accounts.sqlite*', '**/developers.sqlite*'] } },
  };
});
