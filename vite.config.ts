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
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Function-based chunking: keep explicit heavy groups, and bucket every
        // other node_modules package into a shared `vendor` chunk. This pulls
        // the bulk of dependencies out of the 4 MB main `index` chunk, shrinking
        // it and lowering Rollup's peak memory during build (avoids OOM on the
        // 512 MB Render starter plan).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@solana')) return 'vendor-solana';
          if (id.includes('recharts') || /node_modules[/\\]d3/.test(id) || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('@radix-ui')) return 'vendor-ui';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (/node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'vendor-react';
          if (id.includes('ethers')) return 'vendor-ethers';
          if (id.includes('openai') || id.includes('groq-sdk') || id.includes('@mistralai') || id.includes('@google/generative-ai') || id.includes('@anthropic-ai')) return 'vendor-ai';
          return 'vendor';
        },
      },
    },
  },
});
