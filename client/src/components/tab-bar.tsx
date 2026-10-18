"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const tabs = [
  { segment: "connections", label: "connections" },
  { segment: "agent", label: "agent" },
  { segment: "you", label: "you" },
  { segment: "world", label: "world" },
] as const;

export function TabBar() {
  const { userId } = useParams<{ userId: string }>();
  // /u/{id}/{segment}/…; a pair conversation is reached from connections, so it keeps that tab lit.
  const segment = usePathname().split("/")[3];
  const active = segment === "pairs" ? "connections" : segment;
  const index = tabs.findIndex((t) => t.segment === active);
  return (
    <nav className="relative flex rounded-full bg-ink p-1">
      {/* One paper pill that slides to the active tab instead of each tab painting its own. */}
      {index >= 0 && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc((100%-8px)/4)] rounded-full bg-paper transition-transform duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
      )}
      {tabs.map((t) => {
        const on = t.segment === active;
        return (
          <Link
            key={t.segment}
            href={`/u/${userId}/${t.segment}`}
            aria-current={on ? "page" : undefined}
            className={`press relative flex flex-1 items-center justify-center rounded-full py-[11px] fs-11.5 lh-14 tracking-meta duration-300 ${
              on ? "text-ink" : "text-paper hover:text-paper/70"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
