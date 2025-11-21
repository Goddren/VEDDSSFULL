import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker, setupPWAInstallPrompt } from "./lib/pwa";

setupPWAInstallPrompt();

registerServiceWorker().then((registration) => {
  if (registration) {
    console.log('PWA ready for installation');
  }
});

createRoot(document.getElementById("root")!).render(<App />);
