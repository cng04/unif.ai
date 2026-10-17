import Link from "next/link";
import type { ReactNode } from "react";

/** Bracketed mono caption: "( your connections )". */
export function Meta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`meta text-ink/70 ${className}`}>( {children} )</p>;
}

export function Title({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`text-title font-light tracking-label lowercase text-balance ${className}`}>{children}</h1>
  );
}

export function Stat({ value, label, accent }: { value: ReactNode; label: ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-stat font-light tracking-stat ${accent ? "text-ember-text" : ""}`}>{value}</span>
      <span className="micro text-ink/70">{label}</span>
    </div>
  );
}

/** Frosted card from the design system ("stat card · glass"). */
export function Glass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-line bg-surface backdrop-blur-[20px] ${className}`}>{children}</div>
  );
}

export function Bubble({ side, children }: { side: "them" | "you"; children: ReactNode }) {
  return side === "you" ? (
    <div className="rounded-[16px] rounded-tr-[4px] bg-ink px-3.5 py-[11px] text-body font-light tracking-body text-paper">
      {children}
    </div>
  ) : (
    <div className="rounded-[16px] rounded-tl-[4px] border border-line bg-white/60 px-3.5 py-[11px] text-body font-light tracking-body">
      {children}
    </div>
  );
}

export function SpeakerLabel({ side, children }: { side: "them" | "you"; children: ReactNode }) {
  const dot = <span className={`size-[5px] shrink-0 rounded-full ${side === "you" ? "bg-ink" : "bg-ink-faint"}`} />;
  return (
    <div className={`micro flex items-center gap-1.5 text-ink-muted ${side === "you" ? "pr-1" : "pl-1"}`}>
      {side === "them" && dot}
      {children}
      {side === "you" && dot}
    </div>
  );
}

export function PillLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="press flex h-9 items-center rounded-full border border-ink/25 px-4 text-[11.5px] tracking-meta lowercase hover:bg-ink/5"
    >
      {children}
    </Link>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="press -ml-1 flex items-center gap-1.5 py-2 text-label tracking-meta lowercase">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
        <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

/** Vibe is judged 1-10; the design shows it as a two-digit decimal: 9.1 -> ".91". */
export function formatScore(vibe: number | null) {
  if (vibe == null) return "—";
  const s = Math.min(vibe / 10, 1);
  return s >= 1 ? "1.0" : s.toFixed(2).replace(/^0/, "");
}
