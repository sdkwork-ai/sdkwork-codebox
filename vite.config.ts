import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { createSdkworkCredentialEntryBootstrapVitePlugin } from '@sdkwork/iam-credential-entry/vite';
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { getPackageChunk } from "./build/viteChunking";
import { createWorkspaceAliases } from "./workspace.aliases";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const bootstrapAccessToken = env.SDKWORK_ACCESS_TOKEN ?? process.env.SDKWORK_ACCESS_TOKEN;
  return {
  root: "src",
  plugins: [
    // The bootstrap credential reaches the renderer only through the shared IAM
    // plugin (dev-server HTML injection as
    // `globalThis.__SDKWORK_CREDENTIAL_ENTRY_BOOTSTRAP_ACCESS_TOKEN__`).
    // `define['process.env.SDKWORK_ACCESS_TOKEN']` is NOT a valid handoff
    // (IAM_CREDENTIAL_ENTRY_SPEC.md section 4/5).
    createSdkworkCredentialEntryBootstrapVitePlugin({
      accessToken: bootstrapAccessToken,
      environment: resolveViteEnvironment(mode, process.env),
    }),
    command === "serve" &&
      codeInspectorPlugin({
        bundler: "vite",
      }),
    react(),
  ].filter(Boolean),
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return getPackageChunk(id);
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: createWorkspaceAliases(__dirname),
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
};
});
