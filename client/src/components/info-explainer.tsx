import { useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";

// Slide-out explainer: an info button that opens a panel sliding in from
// the right with plain-language detail about the section it sits in.
// The drawer is fixed-position, so opening it never shifts the layout or
// spacing of the page underneath. Styling matches the app's dark panels.
export function InfoExplainer({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`More info: ${title}`}
        title={`More info: ${title}`}
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full align-middle text-gray-500 hover:text-sky-300 hover:bg-white/5 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
          <style>{`@keyframes veddInfoSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-0 h-full w-[86vw] max-w-sm bg-[#0c1220] border-l border-white/10 shadow-2xl flex flex-col"
            style={{ animation: "veddInfoSlideIn 0.22s ease-out" }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Info className="w-4 h-4 text-sky-300 shrink-0" />
              <span className="text-sm font-bold text-gray-100">{title}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="ml-auto shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-100 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed text-gray-300 space-y-2.5">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
