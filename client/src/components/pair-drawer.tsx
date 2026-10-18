"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useOpenPair } from "./use-open-pair";

/**
 * The agent conversation beside the connections graph. Desktop: a non-modal right-hand drawer, with the page
 * shifted left so the graph stays visible and you can tap another match to switch. Phones: a bottom sheet
 * over a backdrop. Open state is `?pair=<id>` in the URL, so back closes it and the link is shareable.
 */
export function PairDrawer({ children }: { children: ReactNode }) {
  const { close } = useOpenPair();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30" role="dialog" aria-label="agent conversation">
      <button
        aria-label="close"
        tabIndex={-1}
        onClick={close}
        className="fade-in pointer-events-auto absolute inset-0 cursor-default bg-ink/10 md:hidden"
      />
      <aside className="sheet-in pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-lg border border-line bg-paper/90 backdrop-blur-[24px] md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[460px] md:rounded-lg">
        {/* Above the scrolling content, so the whole button is the tap target. */}
        <button
          onClick={close}
          aria-label="close conversation"
          className="press absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full border border-ink/20 bg-paper/80 hover:bg-ink/5"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="pointer-events-none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex-1 overflow-y-auto overscroll-contain pt-4 [&>header]:pr-14">{children}</div>
      </aside>
    </div>
  );
}
