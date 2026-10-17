// The "fogged window": out-of-focus colour blobs with film grain over them, fixed to the viewport behind
// all content. Layering (inside the root `isolate` wrapper): blobs at -z-10, grain at -z-5, content above.

export function Grain() {
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 -z-5 h-full w-full opacity-55 mix-blend-multiply">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

export type Blob = {
  color: "ochre" | "ember" | "glacier" | "lichen" | "periwinkle";
  /** Center, as a CSS length relative to the viewport (e.g. "48%"). */
  x: string;
  y: string;
  /** Diameter and blur in px at the 390px mobile design width; both grow with wider viewports. */
  size: number;
  opacity: number;
  blur?: number;
};

const blobColor: Record<Blob["color"], string> = {
  ochre: "var(--color-blob-ochre)",
  ember: "var(--color-blob-ember)",
  glacier: "var(--color-blob-glacier)",
  lichen: "var(--color-blob-lichen)",
  periwinkle: "var(--color-blob-periwinkle)",
};

// px at 390 wide, scaled to a share of the viewport above that (a 230px blob is ~470px at 1440).
const fluid = (px: number) => `max(${px}px, ${((px / 390) * 55).toFixed(2)}vw)`;

export function Blobs({ blobs }: { blobs: Blob[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <div
          key={i}
          className="drift absolute rounded-full"
          style={{
            // Each blob drifts on its own clock, so the fog never moves in lockstep.
            animationDuration: `${22 + i * 5}s`,
            animationDelay: `-${i * 4}s`,
            left: b.x,
            top: b.y,
            width: fluid(b.size),
            height: fluid(b.size),
            translate: "-50% -50%",
            background: blobColor[b.color],
            opacity: b.opacity,
            filter: `blur(${fluid(b.blur ?? 46)})`,
          }}
        />
      ))}
    </div>
  );
}
