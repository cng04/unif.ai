"use client";

// Loaded with `ssr: false` from WorldCanvas, since Pixi needs the DOM and a GPU context.

import { useEffect, useState, type RefObject } from "react";
import type { WorldEngine, EngineEvents } from "./engine";
import { mountWorld } from "./world-renderer";

export default function WorldStage({
  container,
  events,
  onReady,
}: {
  container: RefObject<HTMLDivElement | null>;
  events: RefObject<EngineEvents>;
  onReady: (engine: WorldEngine | null) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const dispose = mountWorld(host, events, (engine) => {
      onReady(engine);
      setStatus(engine ? "ready" : "loading");
    }, (error) => {
      console.error("World renderer failed to initialize", error);
      setStatus("error");
    });
    return dispose;
  }, [container, events, onReady, attempt]);

  if (status === "ready") return null;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center font-mono fs-11 tracking-[0.16em] text-paper/70" role="status">
      {status === "loading" ? "( loading world )" : (
        <div className="flex flex-col items-center gap-4">
          <p>The world couldn’t load.</p>
          <button
            type="button"
            className="press rounded-full bg-paper px-4 py-2 text-ink"
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Retry world
          </button>
        </div>
      )}
    </div>
  );
}
