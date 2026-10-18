import type { ReactNode } from "react";

export const titleClass = "text-[28px] lh-34 font-light tracking-[0.1em] lowercase";

/** A string title is wrapped in the page's h1; anything else renders as-is and brings its own heading. */
export function AdminHeader({
  crumbs,
  title,
  subtitle,
  actions,
}: {
  crumbs: string[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono fs-11 leading-3 tracking-meta text-ink-muted">( {crumbs.join(" / ")} )</p>
        {typeof title === "string" ? <h1 className={titleClass}>{title}</h1> : title}
        {subtitle && <p className="font-mono fs-11 leading-3 tracking-label text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Frosted admin surface ("universe health", the pipeline strip). */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-line bg-white/45 ${className}`}>{children}</section>;
}

export function Caption({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono fs-11 leading-3 tracking-meta text-ink-muted ${className}`}>( {children} )</p>;
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "ember" | "dashed" }) {
  const styles = {
    plain: "border-line text-ink-muted",
    ember: "border-ember/60 text-ember-text",
    dashed: "border-dashed border-ink/40 text-ink-muted",
  }[tone];
  return (
    <span className={`inline-flex rounded-full border px-2 py-[3px] font-mono fs-10 leading-3 tracking-[0.1em] ${styles}`}>
      {children}
    </span>
  );
}

export const outline =
  "press inline-flex items-center rounded-full border border-ink/25 px-4 py-2.5 fs-11.5 lh-14 tracking-meta hover:bg-ink/5";

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
}
