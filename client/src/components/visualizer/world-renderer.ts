import { Application, type Ticker } from "pixi.js";
import { WorldEngine, type EngineEvents } from "./engine";

/** Own one canvas per visible visit; Next's Activity preserves the host DOM between visits. */
export function mountWorld(
  host: HTMLDivElement,
  events: { current: EngineEvents },
  onReady: (engine: WorldEngine | null) => void,
  onError: (error: unknown) => void,
) {
  const app = new Application();
  let disposed = false;
  let initialized = false;
  let released = false;
  let engine: WorldEngine | null = null;
  let observer: ResizeObserver | null = null;
  const debug = window as Window & { __unifaiWorld?: WorldEngine };

  function release() {
    if (!initialized || released) return;
    released = true;
    observer?.disconnect();
    app.stop();
    if (debug.__unifaiWorld === engine) delete debug.__unifaiWorld;
    engine?.destroy();
    app.destroy(true, { children: true });
  }

  void app.init({
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    roundPixels: true,
    autoStart: false,
  }).then(() => {
    initialized = true;
    // Initialization may finish after navigation or Strict Mode's effect cleanup.
    if (disposed) {
      release();
      return;
    }
    host.appendChild(app.canvas);
    function resize() {
      if (host.clientWidth > 0 && host.clientHeight > 0) app.renderer.resize(host.clientWidth, host.clientHeight);
    }
    resize();
    observer = new ResizeObserver(resize);
    observer.observe(host);
    engine = new WorldEngine(app, {
      onSelect: (id) => events.current.onSelect(id),
      onFollow: (on) => events.current.onFollow(on),
      onStatus: (status) => events.current.onStatus(status),
    });
    app.ticker.add((ticker: Ticker) => engine?.update(ticker.deltaMS / 1000));
    if (process.env.NODE_ENV !== "production") debug.__unifaiWorld = engine;
    onReady(engine);
    app.start();
  }).catch((error: unknown) => {
    if (initialized) release();
    else app.stage.destroy({ children: true });
    if (!disposed) {
      onReady(null);
      onError(error);
    }
  });

  return () => {
    disposed = true;
    onReady(null);
    release();
  };
}
