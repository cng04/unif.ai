"use client";

import dynamic from "next/dynamic";

// three.js only loads on the group reveal, and never on the server.
export const GroupGraph3D = dynamic(() => import("./group-graph-3d").then((m) => m.GroupGraph3D), {
  ssr: false,
  loading: () => <p className="meta grid h-full place-items-center text-ink-faint">( loading )</p>,
});
