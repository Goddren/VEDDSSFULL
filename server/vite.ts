import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { SERVER_START_VERSION } from "./version";

const viteLogger = createLogger();
// stable version stamp set once at server start — prevents Vite HMR infinite reload loop
const TEMPLATE_VERSION = nanoid();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: false,
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // process.exit(1) removed — crashes server on transient esbuild errors locally
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${TEMPLATE_VERSION}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");
  console.log(`[serveStatic] Looking for dist at: ${distPath} — exists: ${fs.existsSync(distPath)}`);

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static assets: hashed filenames (JS/CSS/images) can be cached
  // forever; HTML and sw.js must never be cached so mobile always gets the latest entry.
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        // Never cache HTML — ensures mobile picks up new JS chunks immediately
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else if (filePath.endsWith("sw.js") || filePath.endsWith("service-worker.js")) {
        // CRITICAL: service worker must never be HTTP-cached — browser must always
        // re-fetch it to detect version changes. If sw.js is cached, cache busting
        // never fires and mobile stays on the old build indefinitely.
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Service-Worker-Allowed", "/");
      } else if (/\.[0-9a-f]{8,}\.(js|css|woff2?|ttf|svg|png|jpg|webp)$/i.test(filePath)) {
        // Content-hashed assets are immutable — cache forever
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // Fallback: serve index.html for all SPA routes — never cached.
  // We read the file and inject an inline version-check script so the
  // browser can detect new deploys and nuke stale SW caches even when
  // the old service worker is still serving old JS bundles.
  const indexPath = path.resolve(distPath, "index.html");

  // Inline script (no external deps — runs before any bundle loads):
  // • reads vedd-build-version from localStorage
  // • compares with the version stamped at server start
  // • if mismatch: unregisters all SWs, clears all caches, hard-reloads
  const versionScript = `<script>
(function(){
  try{
    var v='${SERVER_START_VERSION}';
    var k='vedd-build-version';
    var stored=localStorage.getItem(k);
    if(stored&&stored!==v){
      localStorage.setItem(k,v);
      var done=function(){location.href=location.href.split('?')[0]+'?v='+v;};
      if('serviceWorker' in navigator){
        navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){return r.unregister();}));
        }).then(function(){
          return 'caches' in window ? caches.keys().then(function(ks){
            return Promise.all(ks.map(function(k){return caches.delete(k);}));
          }) : null;
        }).then(done).catch(done);
      } else { done(); }
    } else {
      localStorage.setItem(k,v);
    }
  }catch(e){}
})();
</script>`;

  app.use("*", async (_req, res) => {
    try {
      res.set({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Content-Type": "text/html; charset=utf-8",
      });
      let html = await fs.promises.readFile(indexPath, "utf-8");
      // Inject version check as the very first thing inside <head>
      html = html.replace("<head>", "<head>" + versionScript);
      res.send(html);
    } catch {
      // File missing — send a minimal reload page
      res.send(`<!DOCTYPE html><html><head>${versionScript}</head><body><script>setTimeout(function(){location.reload()},2000)</script></body></html>`);
    }
  });
}
