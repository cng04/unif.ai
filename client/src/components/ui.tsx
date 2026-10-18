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
      <span className="font-mono text-[10px] leading-[14px] tracking-[0.12em] text-ink/70 md:text-[10.5px]">{label}</span>
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

/** Grey placeholder block for loading states. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-full bg-ink/[0.07] ${className}`} />;
}

/** Loading shell for the agent tab: header plus a few message-shaped bars, so a tab switch never shows a blank page. */
export function AgentSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col md:pt-6" aria-busy="true">
      <div className="flex items-center gap-3 border-b border-line px-5 pt-5 pb-4">
        <span className="size-7 shrink-0 rounded-full border border-ink/20" />
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] leading-4 tracking-label">your agent</span>
          <SkeletonBar className="h-2 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-5 pt-5">
        <SkeletonBar className="h-14 w-[70%] rounded-[16px]" />
        <SkeletonBar className="h-10 w-[55%] self-end rounded-[16px]" />
        <SkeletonBar className="h-16 w-[75%] rounded-[16px]" />
      </div>
    </main>
  );
}

/** Loading shell for the "you" tab. */
export function ProfileSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-7 pt-8 md:px-10 md:pt-12 lg:max-w-5xl" aria-busy="true">
      <p className="meta text-ink/70">( what your agent knows )</p>
      <SkeletonBar className="mt-3 h-6 w-40" />
      <SkeletonBar className="mt-3 h-3 w-56" />
      <div className="mt-8 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-line pb-4">
            <SkeletonBar className="h-2 w-16" />
            <SkeletonBar className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </main>
  );
}
