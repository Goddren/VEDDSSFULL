import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Only load Replit-specific plugins when running inside Replit
const isReplit = process.env.REPL_ID !== undefined;

const replitPlugins = isReplit
  ? [
      (await import("@replit/vite-plugin-shadcn-theme-json")).default(),
      // runtime-error-modal and cartographer are devDependencies — only safe
      // to import in development. Production deploys skip devDeps so importing
      // them would throw "Cannot find module" → exit 127 build failure.
      ...(process.env.NODE_ENV !== "production"
        ? [
            (await import("@replit/vite-plugin-runtime-error-modal")).default(),
            (await import("@replit/vite-plugin-cartographer")).cartographer(),
          ]
        : []),
    ]
  : [];

export default defineConfig({
  plugins: [
    react(),
    ...replitPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
