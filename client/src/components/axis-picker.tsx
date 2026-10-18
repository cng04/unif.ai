"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Glass } from "./ui";

const label = "font-mono text-[11.5px] tracking-[0.1em] lowercase";

/**
 * Legend card for the 3D view: "similarity" (PCA of every keyword) or three Jev keywords as x / y / z.
 * The choice lives in the URL (`?axes=a,b,c`), so the server renders the matching layout.
 */
export function AxisPicker({
  keywords,
  axes,
  className = "",
}: {
  keywords: string[];
  axes: [string, string, string] | null;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (next: string[] | null) => {
    const q = new URLSearchParams(params);
    if (next) q.set("axes", next.join(","));
    else q.delete("axes");
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  if (keywords.length < 3) return null;
  const mode = axes ? "keywords" : "similarity";

  return (
    <Glass className={`flex w-[264px] flex-col gap-3 p-3.5 whitespace-nowrap ${className}`}>
      <span className={`${label} text-ink-muted`}>( axes )</span>
      <div className="grid grid-cols-2 rounded-full border border-ink/20 p-0.5" role="radiogroup" aria-label="axes mode">
        {(["similarity", "keywords"] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => go(m === "similarity" ? null : (axes ?? keywords.slice(0, 3)))}
            className={`press rounded-full py-1.5 ${label} ${mode === m ? "bg-ink text-paper" : "text-ink hover:bg-ink/5"}`}
          >
            {m}
          </button>
        ))}
      </div>

      {axes ? (
        <div className="flex flex-col gap-1.5">
          {axes.map((name, i) => (
            <label key={i} className="flex min-w-0 items-center gap-2.5">
              <span className={`${label} w-3 shrink-0 text-ink-faint`}>{"xyz"[i]}</span>
              {/* min-w-0: a select's intrinsic width is its longest option, which would push it past the card. */}
              <select
                value={name}
                title={name}
                onChange={(e) => go(axes.map((a, j) => (j === i ? e.target.value : a)))}
                className={`${label} h-8 min-w-0 flex-1 truncate rounded-full border border-ink/20 bg-white/40 px-3 text-ink outline-none hover:bg-white/70 focus-visible:border-ink/50`}
              >
                {keywords.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[12px] leading-[17px] font-light tracking-body whitespace-normal text-ink-muted">
          closer together = more alike across every keyword your agents scored.
        </p>
      )}
    </Glass>
  );
}
