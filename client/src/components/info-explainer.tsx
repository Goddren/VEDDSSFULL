import { useState, type ReactNode } from "react";
import { Info, ChevronUp } from "lucide-react";

// Inline explainer: the info (ⓘ) button in a panel header expands the
// explanation INSIDE the same panel, directly beneath the header row —
// no overlay, no portal, no fixed positioning anywhere, so the content
// is always a normal in-flow child of the card and can never render
// off-screen, behind a backdrop, or outside the visible area, on
// mobile or desktop. (The PR #32 slide-over and the PR #33 bottom
// sheet both failed exactly that way in the app webview — Chris could
// tap the button and see nothing.)
//
// Layout contract: this component returns a fragment whose two
// children act as flex items — the button span (sits in the header row)
// and the expandable block (order-last + basis-full, so it wraps onto
// its own full-width line under the row). It must therefore be
// rendered as a DIRECT child of the panel header's flex-wrap container
// (PanelHeader in engine-safeguards-panel.tsx does this). The block
// animates with the grid-template-rows 0fr→1fr technique (~200ms), so
// opening reads as the explanation sliding out of the section, and
// closing leaves zero height behind (the block's top margin lives
// inside the clipped region).
export function InfoExplainer({ title, accent = "border-l-sky-300/60", children }: {
  title: string;
  /** Tailwind border-l color class matching the panel's accent tint. */
  accent?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className="shrink-0 pt-0.5">
        <button
          type="button"
          aria-label={`More info: ${title}`}
          aria-expanded={open}
          title={`More info: ${title}`}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full align-middle text-gray-500 hover:text-sky-300 hover:bg-white/5 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </span>
      <div
        aria-hidden={!open}
        className={`order-last basis-full w-full min-w-0 grid transition-all duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}
      >
        <div className="overflow-hidden min-h-0">
          <div className={`mt-2 rounded-lg border border-white/10 border-l-2 ${accent} bg-black/25 px-3 py-2.5`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Info className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              <span className="min-w-0 flex-1 text-[11px] font-bold text-gray-100 leading-tight">{title}</span>
            </div>
            <div className="text-[11px] leading-relaxed text-gray-300 space-y-2">
              {children}
            </div>
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 hover:text-gray-100 rounded-full px-1.5 py-0.5 hover:bg-white/5 transition-colors"
              >
                Close <ChevronUp className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
