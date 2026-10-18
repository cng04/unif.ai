"use client";

// The Pixi canvas. Loaded with `ssr: false` from WorldCanvas, since Pixi needs the DOM and a GPU context.

import { Application, useApplication, useTick } from "@pixi/react";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Ticker } from "pixi.js";
import { WorldEngine, type EngineEvents } from "./engine";

export default function WorldStage({
  container,
  events,
  onReady,
}: {
  container: RefObject<HTMLDivElement | null>;
  events: RefObject<EngineEvents>;
  onReady: (engine: WorldEngine | null) => void;
}) {
  return (
    <Application
      resizeTo={container}
      background={0x1f1c19}
      antialias={false}
      autoDensity
      resolution={typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2)}
      roundPixels
    >
      <EngineHost events={events} onReady={onReady} />
    </Application>
  );
}

function EngineHost({ events, onReady }: { events: RefObject<EngineEvents>; onReady: (engine: WorldEngine | null) => void }) {
  const { app, isInitialised } = useApplication();
  const engine = useRef<WorldEngine | null>(null);

  useEffect(() => {
    if (!isInitialised) return;
    // Events go through the ref so the engine always calls the latest React handlers.
    const proxy: EngineEvents = {
      onSelect: (id) => events.current.onSelect(id),
      onFloor: (floor) => events.current.onFloor(floor),
      onFollow: (on) => events.current.onFollow(on),
      onStatus: (status) => events.current.onStatus(status),
      onNeedMessages: (pairId) => events.current.onNeedMessages(pairId),
    };
    const instance = new WorldEngine(app, proxy);
    engine.current = instance;
    onReady(instance);
    if (process.env.NODE_ENV !== "production") (window as { __unifaiWorld?: WorldEngine }).__unifaiWorld = instance;
    return () => {
      if (process.env.NODE_ENV !== "production") delete (window as { __unifaiWorld?: WorldEngine }).__unifaiWorld;
      engine.current = null;
      onReady(null);
      instance.destroy();
    };
  }, [app, isInitialised, events, onReady]);

  const tick = useCallback((ticker: Ticker) => engine.current?.update(ticker.deltaMS / 1000), []);
  useTick(tick);
  return null;
}
