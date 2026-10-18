"use client";

import dynamic from "next/dynamic";

// three.js only loads when someone switches to the 3D view, and never on the server.
export const ConnectionsGraph3D = dynamic(
  () => import("./connections-graph-3d").then((m) => m.ConnectionsGraph3D),
  {
    ssr: false,
    loading: () => <p className="meta grid h-full place-items-center text-ink-faint">( loading 3d )</p>,
  },
);
