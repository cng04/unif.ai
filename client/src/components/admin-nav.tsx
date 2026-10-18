"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavUniverse = { id: string; name: string };

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden className="shrink-0">
      <path d="M30 28 L30 90 L90 90 L90 28" fill="none" stroke="var(--color-ink)" strokeWidth="7" />
      {[[30, 28], [30, 90], [90, 90], [90, 28]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="14" fill="var(--color-ink)" />
      ))}
    </svg>
  );
}

/** Sidebar links: "universes" always, plus the current universe's pages once one is open. */
export function AdminNav({ universes = [] }: { universes?: NavUniverse[] }) {
  const path = usePathname();
  const router = useRouter();
  const universeId = path.match(/^\/admin\/universes\/([^/]+)/)?.[1];
  const choices = universeId && !universes.some((u) => u.id === universeId) ? [...universes, { id: universeId, name: universeId }] : universes;
  const switchUniverse = (nextId: string) => {
    if (!universeId || nextId === universeId) return;
    const rest = path.slice(`/admin/universes/${universeId}`.length);
    router.push(`/admin/universes/${nextId}${rest}`);
  };
  const items = [
    { href: "/admin", label: "universes", on: path === "/admin" },
    ...(universeId
      ? [
          { href: `/admin/universes/${universeId}`, label: "overview", on: path === `/admin/universes/${universeId}`, nested: true },
          { href: `/admin/universes/${universeId}/groups`, label: "groups", on: path.endsWith("/groups"), nested: true },
          { href: `/admin/universes/${universeId}/world`, label: "world", on: path.endsWith("/world"), nested: true },
        ]
      : []),
  ];
  return (
    <nav className="-my-1 flex min-w-0 gap-1 overflow-x-auto py-1 lg:flex-col lg:overflow-visible">
      {universeId && choices.length > 0 && (
        <label className="flex min-w-[180px] flex-col gap-1 px-3 py-1 lg:mb-2 lg:min-w-0">
          <span className="font-mono text-[9.5px] leading-3 tracking-[0.14em] text-ink-muted">universe</span>
          <select
            aria-label="Universe"
            value={universeId}
            onChange={(e) => switchUniverse(e.target.value)}
            className="h-8 min-w-0 truncate rounded-full border border-ink/20 bg-white/40 px-3 font-mono text-[11px] tracking-[0.06em] text-ink outline-none hover:bg-white/70 focus-visible:border-ink/50"
          >
            {choices.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.on ? "page" : undefined}
          className={`press rounded-[10px] px-3 py-[9px] fs-12 leading-4 tracking-meta ${
            item.on ? "bg-ink text-paper" : "hover:bg-ink/5"
          } ${item.nested ? "lg:ml-3" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
