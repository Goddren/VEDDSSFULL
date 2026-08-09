import { useMemo, useRef } from "react";
import logoImg from "@/assets/IMG_3645.png";
// Raw HTML of the self-contained, print-optimized event kit. Rendered in an
// isolated iframe so its bespoke (warm-paper, print-first) styling never
// collides with the app's global dark theme, and its @media print / @page
// rules stay intact for "Save as PDF".
import kitHtml from "./event-kit-content.html?raw";
import { ExternalLink, Printer } from "lucide-react";

const btn: React.CSSProperties = {
  font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
  borderRadius: 8, padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: 6,
};

export default function EventKitPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Fill the logo placeholder with the bundled asset URL (avoids inlining a
  // 230KB data URI into the JS bundle).
  const srcDoc = useMemo(() => kitHtml.replace("__LOGO_SRC__", logoImg), []);

  // Grow the iframe to its content height so the kit flows inside the app page
  // with a single scrollbar instead of a nested one.
  const handleLoad = () => {
    const f = iframeRef.current;
    if (!f?.contentWindow) return;
    try {
      f.style.height = f.contentWindow.document.documentElement.scrollHeight + "px";
    } catch { /* cross-origin guard — srcDoc is same-origin, so this rarely trips */ }
  };

  const printKit = () => iframeRef.current?.contentWindow?.print();
  const openInTab = () => {
    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(srcDoc); w.document.close(); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080B14" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", background: "#0D1117", borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginRight: "auto" }}>
          VEDD Event Host Kit
        </span>
        <button onClick={printKit} style={{ ...btn, color: "#fff", background: "#dc2626", border: "none" }}>
          <Printer size={15} /> Print / Save PDF
        </button>
        <button onClick={openInTab} style={{ ...btn, color: "#f59e0b", background: "transparent", border: "1px solid rgba(245,158,11,0.4)" }}>
          <ExternalLink size={15} /> Open in new tab
        </button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        onLoad={handleLoad}
        title="VEDD Event Host Kit"
        style={{ width: "100%", border: 0, display: "block", background: "#FAF8F4", minHeight: "80vh" }}
      />
    </div>
  );
}
