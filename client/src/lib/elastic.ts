// A small spring layout shared by the 2D and 3D connections graphs, Obsidian-style: each node is pulled
// toward its home (where the layout put it), edges are springs at their home length, and nodes that get too
// close push apart. Dragging pins a node and its neighbours follow elastically. Works in any dimension.

export type Spring = { a: number; b: number };

type Options = {
  /** Pull toward home, per step. */
  anchor: number;
  /** Edge stiffness. */
  spring: number;
  /** Velocity kept per step. */
  damping: number;
  /** Per-node collision radius, in layout units. */
  radius: number[];
};

const REST = 1e-3;

export class Elastic {
  readonly n: number;
  private readonly dim: number;
  private readonly p: Float64Array;
  private readonly v: Float64Array;
  private readonly home: Float64Array;
  private readonly origin: Float64Array;
  private readonly rest: Float64Array;
  private readonly pinned: Set<number> = new Set();
  private readonly still: number;

  constructor(
    homes: number[][],
    private readonly springs: Spring[],
    private readonly opt: Options,
  ) {
    this.n = homes.length;
    this.dim = homes[0]?.length ?? 2;
    this.origin = Float64Array.from(homes.flat());
    this.home = this.origin.slice();
    this.p = this.origin.slice();
    this.v = new Float64Array(this.p.length);
    this.rest = Float64Array.from(springs, ({ a, b }) => this.dist(this.home, a, b));
    // Below this speed (relative to node size) a node counts as settled.
    this.still = (this.n ? Math.min(...opt.radius) : 1) * 0.002;
  }

  get(i: number): number[] {
    return Array.from(this.p.subarray(i * this.dim, (i + 1) * this.dim));
  }

  /** Holds node i at `at` until release. */
  drag(i: number, at: number[]) {
    this.pinned.add(i);
    for (let d = 0; d < this.dim; d++) {
      this.p[i * this.dim + d] = at[d];
      this.v[i * this.dim + d] = 0;
    }
  }

  /** `stay`: the drop point becomes the node's new home; otherwise it springs back. */
  release(i: number, stay: boolean) {
    this.pinned.delete(i);
    if (stay) for (let d = 0; d < this.dim; d++) this.home[i * this.dim + d] = this.p[i * this.dim + d];
  }

  /** Back to the original layout (animated by the following steps). */
  reset() {
    this.home.set(this.origin);
  }

  /** One integration step. Returns false once everything has come to rest. */
  step(): boolean {
    const { dim, p, v, home, n } = this;
    const { anchor, spring, damping, radius } = this.opt;
    const f = new Float64Array(p.length);
    for (let k = 0; k < p.length; k++) f[k] = (home[k] - p[k]) * anchor;
    this.springs.forEach(({ a, b }, s) => {
      const d = this.dist(p, a, b) || REST;
      const pull = (spring * (d - this.rest[s])) / d;
      for (let k = 0; k < dim; k++) {
        const delta = (p[b * dim + k] - p[a * dim + k]) * pull;
        f[a * dim + k] += delta;
        f[b * dim + k] -= delta;
      }
    });
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const min = radius[a] + radius[b];
        let sq = 0;
        for (let k = 0; k < dim; k++) sq += (p[b * dim + k] - p[a * dim + k]) ** 2;
        if (sq >= min * min) continue;
        const d = Math.sqrt(sq) || REST;
        const push = (0.25 * (min - d)) / d;
        for (let k = 0; k < dim; k++) {
          // Exactly overlapping nodes get split along a stable direction.
          const delta = (sq ? p[b * dim + k] - p[a * dim + k] : k === 0 ? REST : 0) * push;
          f[a * dim + k] -= delta;
          f[b * dim + k] += delta;
        }
      }
    }
    let moving = this.pinned.size > 0;
    const { still } = this;
    for (let i = 0; i < n; i++) {
      if (this.pinned.has(i)) continue;
      for (let k = 0; k < dim; k++) {
        const j = i * dim + k;
        v[j] = (v[j] + f[j]) * damping;
        p[j] += v[j];
        if (Math.abs(v[j]) > still || Math.abs(f[j]) > still) moving = true;
      }
    }
    return moving;
  }

  private dist(arr: Float64Array, a: number, b: number) {
    let sq = 0;
    for (let k = 0; k < this.dim; k++) sq += (arr[b * this.dim + k] - arr[a * this.dim + k]) ** 2;
    return Math.sqrt(sq);
  }
}
