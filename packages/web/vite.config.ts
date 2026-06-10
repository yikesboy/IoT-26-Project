import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fixupTslibImport, pnpmStoreAllow } from "./vite.plugins";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    fixupTslibImport(),
    pnpmStoreAllow(),
    tanstackStart(),
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
});
