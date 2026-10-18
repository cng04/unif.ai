"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const select =
  "micro h-7 rounded-full border border-ink/25 bg-transparent px-2.5 text-ink lowercase outline-none hover:bg-ink/5";

/** Picks what the 3D view's axes mean: "auto" (similarity) or three Jev keywords. Lives in the URL. */
export function AxisPicker({ keywords, axes }: { keywords: string[]; axes: [string, string, string] | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (next: string[] | null) => {
    const q = new URLSearchParams(params);
    if (next) q.set("axes", next.join(","));
    else q.delete("axes");
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  if (keywords.length < 3) return null;
  const current = axes ?? (keywords.slice(0, 3) as [string, string, string]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="micro text-ink/70">axes</span>
      <select className={select} value={axes ? "keywords" : "auto"} onChange={(e) => go(e.target.value === "auto" ? null : current)}>
        <option value="auto">auto · similarity</option>
        <option value="keywords">keywords</option>
      </select>
      {axes &&
        axes.map((name, i) => (
          <select
            key={i}
            className={select}
            aria-label={`${"xyz"[i]} axis`}
            value={name}
            onChange={(e) => go(axes.map((a, j) => (j === i ? e.target.value : a)))}
          >
            {keywords.map((k) => (
              <option key={k} value={k}>
                {"xyz"[i]} · {k}
              </option>
            ))}
          </select>
        ))}
    </div>
  );
}
