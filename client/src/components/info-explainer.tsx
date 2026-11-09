import { useEffect, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";

// Slide-out explainer: an info button that opens a panel with plain-
// language detail about the section it sits in. The drawer is fixed-
// position, so opening it never shifts the layout or spacing of the
// page underneath. Styling matches the app's dark panels.
//
// Mobile (<sm): a BOTTOM SHEET — full width, rounded top corners, the
// title bar pinned at the top of the sheet and the body scrolling
// inside it, so the info is fully visible the moment it opens with no
// page scrolling. Desktop (sm+): the original right slide-over, sized
// with 100dvh so mobile browser chrome can't push it off-screen.
// Body scroll is locked while either variant is open.
export function InfoExplainer({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

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
          <style>{`
            @keyframes veddInfoSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes veddInfoSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .vedd-info-panel { animation: veddInfoSlideIn 0.22s ease-out; }
            @media (max-width: 639px) { .vedd-info-panel { animation: veddInfoSheetUp 0.25s ease-out; } }
          `}</style>
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div
            className="vedd-info-panel absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t border-white/10 bg-[#0c1220] shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:left-auto sm:right-0 sm:top-0 sm:bottom-auto sm:h-[100dvh] sm:max-h-none sm:w-[86vw] sm:max-w-sm sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0"
          >
            <div className="sm:hidden shrink-0 pt-2 pb-0.5" aria-hidden="true">
              <div className="mx-auto w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Info className="w-4 h-4 text-sky-300 shrink-0" />
              <span className="min-w-0 flex-1 text-sm font-bold text-gray-100 leading-tight">{title}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="ml-auto shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-100 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 text-[12px] leading-relaxed text-gray-300 space-y-2.5">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
