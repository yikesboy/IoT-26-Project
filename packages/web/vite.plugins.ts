import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath } from "node:url";

import { searchForWorkspaceRoot } from "vite";

import type { Plugin } from "vite";

export function fixupTslibImport(): Plugin {
  return {
    name: "fixup-tslib-import",

    config() {
      return {
        resolve: {
          alias: {
            tslib: fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs")),
          },
        },
      };
    },
  };
}

export function pnpmStoreAllow(): Plugin {
  return {
    name: "pnpm-store-allow",

    async config(config) {
      const workspaceRoot = searchForWorkspaceRoot(cwd(), config.root);
      const nodeModulesPath = join(workspaceRoot, "node_modules");
      const modulesPath = join(nodeModulesPath, ".modules.yaml");
      const content = JSON.parse(await readFile(modulesPath, "utf-8"));
      const virtualStoreDir = resolve(nodeModulesPath, content.virtualStoreDir);

      return {
        server: {
          fs: {
            allow: [workspaceRoot, virtualStoreDir],
          },
        },
      };
    },
  };
}
