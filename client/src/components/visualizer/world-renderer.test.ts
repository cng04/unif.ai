import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvents } from "./engine";
import { mountWorld } from "./world-renderer";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class FakeApplication {
  pending = deferred();
  canvas = {};
  stage = { destroy: vi.fn() };
  renderer = { resize: vi.fn() };
  ticker = { add: vi.fn() };
  init = vi.fn(() => this.pending.promise);
  start = vi.fn();
  stop = vi.fn();
  destroy = vi.fn();
}

const fakes = vi.hoisted(() => ({
  apps: [] as FakeApplication[],
  engines: [] as { destroy: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; events: EngineEvents }[],
  observers: [] as { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[],
}));

vi.mock("pixi.js", () => ({
  Application: class {
    constructor() {
      const app = new FakeApplication();
      fakes.apps.push(app);
      return app;
    }
  },
}));
vi.mock("./engine", () => ({
  WorldEngine: class {
    constructor(_app: unknown, events: EngineEvents) {
      const engine = { destroy: vi.fn(), update: vi.fn(), events };
      fakes.engines.push(engine);
      return engine;
    }
  },
}));

beforeEach(() => {
  fakes.apps.length = 0;
  fakes.engines.length = 0;
  fakes.observers.length = 0;
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) {
      const observer = { callback, observe: vi.fn(), disconnect: vi.fn() };
      fakes.observers.push(observer);
      return observer;
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const host = { clientWidth: 900, clientHeight: 700, appendChild: vi.fn() };
  const events = { current: { onSelect: vi.fn(), onFollow: vi.fn(), onStatus: vi.fn() } };
  const onReady = vi.fn();
  const onError = vi.fn();
  const mount = () => mountWorld(host as unknown as HTMLDivElement, events, onReady, onError);
  return { host, events, onReady, onError, mount };
}

async function finish(app: FakeApplication) {
  app.pending.resolve();
  await app.pending.promise;
}

describe("world renderer lifecycle", () => {
  it("creates a fresh canvas when a preserved page is shown again", async () => {
    const { host, mount, onReady } = setup();
    const leave = mount();
    await finish(fakes.apps[0]);
    expect(onReady).toHaveBeenLastCalledWith(fakes.engines[0]);
    leave();
    expect(onReady).toHaveBeenLastCalledWith(null);
    expect(fakes.apps[0].stop).toHaveBeenCalledOnce();
    expect(fakes.engines[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.apps[0].destroy).toHaveBeenCalledWith(true, { children: true });
    expect(fakes.observers[0].disconnect).toHaveBeenCalledOnce();
    const leaveAgain = mount();
    await finish(fakes.apps[1]);
    expect(host.appendChild.mock.calls.map(([canvas]) => canvas)).toEqual(fakes.apps.map((app) => app.canvas));
    expect(fakes.apps[1].canvas).not.toBe(fakes.apps[0].canvas);
    expect(onReady).toHaveBeenLastCalledWith(fakes.engines[1]);
    expect(fakes.apps[1].start).toHaveBeenCalledOnce();
    leaveAgain();
  });

  it("disposes a late initialization without replacing the current visit", async () => {
    const { host, mount, onReady, onError } = setup();
    mount()();
    const leave = mount();
    await finish(fakes.apps[1]);
    await finish(fakes.apps[0]);
    expect(host.appendChild).toHaveBeenCalledExactlyOnceWith(fakes.apps[1].canvas);
    expect(fakes.apps[0].destroy).toHaveBeenCalledOnce();
    expect(fakes.apps[0].start).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenLastCalledWith(fakes.engines[0]);
    expect(fakes.apps[1].destroy).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    leave();
  });

  it("reports initialization errors and can initialize again on retry", async () => {
    const { mount, onReady, onError } = setup();
    const leave = mount();
    const error = new Error("renderer unavailable");
    fakes.apps[0].pending.reject(error);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(onReady).toHaveBeenLastCalledWith(null);
    expect(fakes.apps[0].stage.destroy).toHaveBeenCalledOnce();
    leave();
    const leaveAgain = mount();
    await finish(fakes.apps[1]);
    expect(onReady).toHaveBeenLastCalledWith(fakes.engines[0]);
    leaveAgain();
  });

  it("ignores initialization errors from a visit that was already hidden", async () => {
    const { mount, onError } = setup();
    mount()();
    fakes.apps[0].pending.reject(new Error("cancelled visit"));
    await vi.waitFor(() => expect(fakes.apps[0].stage.destroy).toHaveBeenCalledOnce());
    expect(onError).not.toHaveBeenCalled();
  });

  it("resizes after a zero-sized host becomes visible", async () => {
    const { host, mount } = setup();
    host.clientWidth = 0;
    host.clientHeight = 0;
    const leave = mount();
    await finish(fakes.apps[0]);
    expect(fakes.apps[0].renderer.resize).not.toHaveBeenCalled();
    host.clientWidth = 900;
    host.clientHeight = 700;
    fakes.observers[0].callback();
    expect(fakes.apps[0].renderer.resize).toHaveBeenCalledWith(900, 700);
    leave();
  });

  it("forwards events to the latest React handlers and advances animation", async () => {
    const { mount, events } = setup();
    const leave = mount();
    await finish(fakes.apps[0]);
    const onSelect = vi.fn();
    events.current = { ...events.current, onSelect };
    fakes.engines[0].events.onSelect("agent");
    expect(onSelect).toHaveBeenCalledWith("agent");
    fakes.apps[0].ticker.add.mock.calls[0][0]({ deltaMS: 20 });
    expect(fakes.engines[0].update).toHaveBeenCalledWith(0.02);
    leave();
  });
});
