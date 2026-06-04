import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker, setupPWAInstallPrompt } from "./lib/pwa";

setupPWAInstallPrompt();

// ── Deploy-version check ─────────────────────────────────────────────────────
// Fetches /api/build-version (network-only, bypasses SW cache) to detect when
// Render has deployed a new build. If the version changed since last visit:
//   1. Unregister all service workers
//   2. Clear all SW caches
//   3. Hard-reload so the browser fetches fresh HTML + JS bundles
//
// This is the nuclear fallback that guarantees mobile users always get the
// latest build even when the SW is stuck serving stale cached assets.
async function checkDeployVersion(): Promise<void> {
  try {
    // ?t= query param bypasses any HTTP-level caching
    const res = await fetch(`/api/build-version?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version) return;

    const stored = localStorage.getItem('vedd-build-version');

    if (stored && stored !== version) {
      console.log('[VEDD] New deploy detected — clearing SW caches and reloading');
      localStorage.setItem('vedd-build-version', version);

      // Unregister every SW registration
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // Wipe all SW caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Hard reload — browser fetches everything fresh from the network
      window.location.reload();
      return;
    }

    // First visit or already up-to-date — store/update the version
    localStorage.setItem('vedd-build-version', version);
  } catch {
    // Network error or server not ready — safe to ignore, try again next load
  }
}

// Run version check first, then register SW and mount app
checkDeployVersion().finally(() => {
  registerServiceWorker().then((registration) => {
    if (registration) {
      console.log('PWA ready for installation');
    }
  });

  createRoot(document.getElementById("root")!).render(<App />);
});
