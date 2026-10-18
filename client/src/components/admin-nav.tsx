"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
export function AdminNav() {
  const path = usePathname();
  const universeId = path.match(/^\/admin\/universes\/([^/]+)/)?.[1];
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
