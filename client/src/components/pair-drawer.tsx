"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useOpenPair } from "./use-open-pair";

/**
 * The agent conversation over the connections graph: a right-hand drawer on desktop, a bottom sheet on
 * phones. Open state is `?pair=<id>` in the URL, so back closes it and the link is shareable.
 */
export function PairDrawer({ children }: { children: ReactNode }) {
  const { close } = useOpenPair();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label="agent conversation">
      <button aria-label="close" onClick={close} className="fade-in absolute inset-0 cursor-default bg-ink/10" />
      <aside className="sheet-in absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-lg border border-line bg-paper/90 backdrop-blur-[24px] md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[460px] md:rounded-lg">
        <div className="flex justify-end px-3 pt-3">
          <button
            onClick={close}
            aria-label="close conversation"
            className="press grid size-9 place-items-center rounded-full border border-ink/20 hover:bg-ink/5"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="-mt-6 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </div>
  );
}
