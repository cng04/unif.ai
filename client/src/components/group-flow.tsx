import Link from "next/link";

const STEPS = ["meet", "pick a plan", "show up"] as const;

/** "1 meet · 2 pick a plan · 3 show up", with the current step dark. Steps you've reached (up to `reached`) link. */
export function GroupSteps({ userId, current, reached = current }: { userId: string; current: 1 | 2 | 3; reached?: 1 | 2 | 3 }) {
  const href = (i: number) => `/u/${userId}/group${["", "/plans", "/show-up"][i - 1]}`;
  return (
    <nav className="flex justify-center gap-3.5 font-mono text-meta leading-3 tracking-meta" aria-label="group steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const target = n !== current && n <= reached ? href(n) : null;
        const text = `${n} ${label}`;
        return (
          <span key={label} className="flex gap-3.5">
            {i > 0 && <span className="text-ink-faint">·</span>}
            {target ? (
              <Link href={target} className="text-ink-muted hover:text-ink">
                {text}
              </Link>
            ) : (
              <span className={n === current ? "text-ink" : "text-ink-faint"} aria-current={n === current ? "step" : undefined}>
                {text}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** "you're both into climbing and long breakfasts", from the keywords two people both score high on. */
export function sharedLine(keywords: string[]) {
  if (keywords.length === 0) return null;
  const list = keywords.length === 1 ? keywords[0] : `${keywords.slice(0, -1).join(", ")} and ${keywords.at(-1)}`;
  return `You're both into ${list}.`;
}
