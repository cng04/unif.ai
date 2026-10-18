import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { RunMatchingButton } from "@/components/admin-forms";
import { AdminHeader, Caption, Chip, outline, Panel, shortDate } from "@/components/admin-ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { CountUp } from "@/components/count-up";
import { adminApi, ApiError, type UniverseDetail } from "@/lib/api";
import { runMatching } from "../../actions";

// Matching needs at least one full group (MIN_GROUP_SIZE on the server).
const MIN_TO_MATCH = 4;

export default function UniversePage({ params, searchParams }: PageProps<"/admin/universes/[universeId]">) {
  return (
    <Suspense fallback={<Caption>loading universe</Caption>}>
      <UniverseScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Filter = "all" | "waiting" | "unplaced";

async function UniverseScreen({
  params,
  searchParams,
}: {
  params: Promise<{ universeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { universeId } = await params;
  const show = ((await searchParams).show ?? "all") as Filter;
  const universe = await adminApi.universe(universeId).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const { stats } = universe;
  const matched = universe.status === "matched";
  const isUnplaced = (m: UniverseDetail["members"][number]) => matched && m.status === "complete" && !m.group;
  const counts = {
    all: universe.members.length,
    waiting: universe.members.filter((m) => m.status !== "complete").length,
    unplaced: universe.members.filter(isUnplaced).length,
  };
  const members = universe.members.filter((m) =>
    show === "waiting" ? m.status !== "complete" : show === "unplaced" ? isUnplaced(m) : true,
  );

  return (
    <>
      {universe.status === "matching" && <AutoRefresh seconds={10} />}
      <AdminHeader
        crumbs={["universes", universe.name]}
        title={universe.name}
        subtitle={`${universe.status} · created ${shortDate(universe.created_at)} · invite code ${universe.invite_code}`}
        actions={
          <>
            {stats.groups > 0 && (
              <Link href={`/admin/universes/${universeId}/groups`} className={outline}>
                groups →
              </Link>
            )}
            <a href={universe.invite_url} target="_blank" rel="noreferrer" className={outline}>
              join page ↗
            </a>
          </>
        }
      />

      <Pipeline universe={universe} />

      <div className="flex flex-col gap-6 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
            <Caption>members · {stats.members}</Caption>
            <div className="flex gap-3.5 font-mono text-[10px] leading-3 tracking-label">
              <FilterLink universeId={universeId} value="all" current={show}>all</FilterLink>
              <FilterLink universeId={universeId} value="waiting" current={show}>not onboarded · {counts.waiting}</FilterLink>
              {matched && (
                <FilterLink universeId={universeId} value="unplaced" current={show}>unplaced · {counts.unplaced}</FilterLink>
              )}
            </div>
          </div>
          <MembersTable members={members} matched={matched} />
        </section>
        <div className="flex shrink-0 flex-col gap-6 self-start xl:w-[280px]">
          <Health universe={universe} />
          {universe.keywords.length > 0 && <Keywords keywords={universe.keywords} scored={stats.scored} />}
        </div>
      </div>
    </>
  );
}

function FilterLink({ universeId, value, current, children }: { universeId: string; value: Filter; current: Filter; children: ReactNode }) {
  return (
    <Link
      href={value === "all" ? `/admin/universes/${universeId}` : `/admin/universes/${universeId}?show=${value}`}
      scroll={false}
      className={value === current ? "text-ink" : "text-ink-muted hover:text-ink"}
    >
      {children}
    </Link>
  );
}

type StageState = "done" | "active" | "todo";
type Stage = { label: string; value: ReactNode; sub?: ReactNode; state: StageState; extra?: ReactNode; wide?: boolean };

function Pipeline({ universe }: { universe: UniverseDetail }) {
  const { stats, status } = universe;
  const ready = stats.onboarded >= MIN_TO_MATCH;
  const run = (label: string) => (
    <RunMatchingButton action={runMatching.bind(null, universe.id)} label={label} disabled={!ready} />
  );
  const stages: Stage[] = [
    {
      label: `01 · onboarding${ready ? " ✓" : ""}`,
      value: <><CountUp to={stats.onboarded} /> / {stats.members}</>,
      sub: ready ? "onboarded" : `need ${MIN_TO_MATCH} to match`,
      state: ready ? "done" : "active",
    },
    status === "onboarding"
      ? {
          label: `02 · matching${ready ? " · ready" : ""}`,
          value: `${stats.onboarded} people`,
          extra: run("run matching ▸"),
          state: ready ? "active" : "todo",
          wide: true,
        }
      : status === "matching"
        ? {
            label: "02 · matching · running",
            value: <span className="animate-pulse">{stats.pairs} chats so far</span>,
            sub: `${stats.keywords} keywords · ${stats.scored} scored`,
            state: "active",
            wide: true,
          }
        : {
            label: "02 · matching ✓",
            value: <><CountUp to={stats.pairs} /> chats</>,
            sub: `${stats.keywords} keywords · ${stats.conflicts} ruled out`,
            state: "done",
          },
    status === "matched"
      ? {
          label: "03 · groups · review",
          value: `${stats.placed} → ${stats.groups} groups`,
          sub: `${stats.unplaced} unplaced`,
          extra: (
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href={`/admin/universes/${universe.id}/groups`}
                className="press rounded-full bg-ink px-3.5 py-[7px] text-label leading-3 tracking-meta text-paper"
              >
                review groups →
              </Link>
              {/* Re-running deletes this run's pairs and groups first (see pipeline.py). */}
              <RunMatchingButtonLight universeId={universe.id} />
            </div>
          ),
          state: "active",
          wide: true,
        }
      : { label: "03 · groups", value: "—", sub: "after matching", state: "todo" },
    status === "matched"
      ? {
          label: "04 · events ✓",
          value: <CountUp to={stats.events} />,
          sub: `for ${stats.groups_with_events} of ${stats.groups} groups`,
          state: "done",
        }
      : { label: "04 · events", value: "—", sub: "after groups", state: "todo" },
  ];
  const firstOpen = stages.findIndex((s) => s.state !== "done");
  const progress = firstOpen === -1 ? 1 : firstOpen / stages.length;

  return (
    <Panel className="relative flex flex-col gap-1 px-2 py-2.5 md:flex-row md:gap-2">
      {/* The rail: solid through finished stages, dotted after. */}
      <svg aria-hidden className="absolute top-[23px] left-[31px] hidden h-3 w-[calc(100%-62px)] md:block" preserveAspectRatio="none">
        <line x1="0" y1="6" x2={`${progress * 100}%`} y2="6" stroke="var(--color-ink)" strokeOpacity="0.6" strokeWidth="1.2" className="draw-in" pathLength={1} />
        <line x1={`${progress * 100}%`} y1="6" x2="100%" y2="6" stroke="var(--color-ink)" strokeOpacity="0.18" strokeDasharray="3 5" />
      </svg>
      {stages.map((s, i) => (
        <StageCell key={i} stage={s} />
      ))}
    </Panel>
  );
}

function StageCell({ stage: s }: { stage: Stage }) {
  const active = s.state === "active";
  return (
    <div
      // Every stage gets the same padded box, so labels line up whether or not a stage is highlighted.
      className={`relative flex flex-col gap-2 rounded-[14px] border px-4 py-3 ${s.wide ? "md:grow-[1.3]" : "md:grow"} md:basis-0 ${
        active ? "border-ember/50 bg-sheet" : "border-transparent"
      } ${s.state === "todo" ? "opacity-55" : ""}`}
    >
      <span
        className={`size-3 shrink-0 rounded-full ${
          s.state === "done"
            ? "bg-ink"
            : active
              ? "border-2 border-ember bg-sheet"
              : "border-[1.2px] border-ink bg-paper"
        }`}
      />
      <span className={`font-mono text-[10px] leading-3 tracking-label ${active ? "text-ember-text" : "text-ink-muted"}`}>
        {s.label}
      </span>
      <span className="text-stat leading-6 font-light tracking-[0.04em]">{s.value}</span>
      {s.sub && <span className="font-mono text-meta leading-3 tracking-[0.12em] text-ink-muted">{s.sub}</span>}
      {s.extra}
    </div>
  );
}

function RunMatchingButtonLight({ universeId }: { universeId: string }) {
  return (
    <details className="group">
      <summary className="micro cursor-pointer list-none text-ink-muted hover:text-ink">re-run…</summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="micro max-w-[200px] text-ink-muted">replaces every pair, chat and group in this universe</p>
        <RunMatchingButton action={runMatching.bind(null, universeId)} label="re-run matching" />
      </div>
    </details>
  );
}

const statusMark: Record<string, { icon: string; muted: boolean }> = {
  complete: { icon: "●", muted: false },
  chatting: { icon: "◐", muted: true },
  invited: { icon: "○", muted: true },
};

function MembersTable({ members, matched }: { members: UniverseDetail["members"]; matched: boolean }) {
  if (members.length === 0) return <Caption className="py-6">nobody here yet</Caption>;
  const cell = "py-[11px] pr-4 font-mono text-[10px] leading-3 tracking-[0.1em] whitespace-nowrap";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-ink/25">
            {["name", "contact", "onboarding", "dealbreakers", "group", "chats", "flags"].map((h) => (
              <th key={h} className="py-2 pr-4 font-mono text-meta leading-3 font-normal tracking-label text-ink-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => {
            const done = m.status === "complete";
            const unplaced = matched && done && !m.group;
            return (
              <tr
                key={m.id}
                className="group rise-in border-b border-line transition-colors hover:bg-white/30"
                style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}
              >
                <td className="py-[11px] pr-4 text-[12.5px] leading-4 tracking-[0.08em] lowercase">
                  <a href={`/u/${m.id}`} target="_blank" rel="noreferrer" className="hover:underline" title="open their page">
                    {m.full_name}
                    <span className="ml-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">↗</span>
                  </a>
                </td>
                <td className={`${cell} text-ink-muted`}>{m.contact ?? "—"}</td>
                <td className={`${cell} ${statusMark[m.status].muted ? "text-ink-muted" : ""}`}>
                  {statusMark[m.status].icon} {m.status}
                </td>
                <td className={cell}>{done ? `✓ ${m.dealbreakers}` : <span className="text-ink-muted">—</span>}</td>
                <td className={`${cell} ${m.group ? "" : "text-ink-muted"}`}>{m.group ?? (unplaced ? "unplaced" : "—")}</td>
                <td className={`${cell} ${m.chats ? "" : "text-ink-muted"}`}>{m.chats || "—"}</td>
                <td className={cell}>
                  {unplaced ? (
                    <Chip tone={m.strong_ties ? "plain" : "ember"}>
                      {m.strong_ties ? `${m.strong_ties} strong tie${m.strong_ties === 1 ? "" : "s"}` : "no strong ties"}
                    </Chip>
                  ) : matched && done && m.chats === 0 ? (
                    <Chip tone="ember">no chats</Chip>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Health({ universe }: { universe: UniverseDetail }) {
  const { stats } = universe;
  const pct = stats.members ? Math.round((stats.onboarded / stats.members) * 100) : 0;
  return (
    <Panel className="flex flex-col gap-[18px] p-[22px]">
      <Caption>universe health</Caption>
      <Metric value={<><CountUp to={pct} />%</>} label={`onboarded · ${stats.onboarded} of ${stats.members}`} />
      {stats.pairs > 0 && (
        <>
          <Metric
            value={stats.avg_vibe != null ? `${stats.avg_vibe.toFixed(1)} / 10` : "—"}
            label="average chemistry across agent chats"
          />
          <Metric
            value={<CountUp to={stats.conflicts} />}
            label="pairs ruled out by the judge"
            accent={stats.conflicts > 0}
          />
        </>
      )}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <span className="font-mono text-meta leading-3 tracking-label text-ink-muted">invite link</span>
        <code className="font-mono text-[10px] leading-4 break-all">{universe.invite_url}</code>
        <div>
          <CopyButton text={universe.invite_url} label="copy link" />
        </div>
      </div>
    </Panel>
  );
}

function Metric({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-[24px] leading-[30px] font-light tracking-[0.04em] ${accent ? "text-ember-text" : ""}`}>{value}</span>
      <span className="font-mono text-meta leading-3 tracking-label text-ink-muted">{label}</span>
    </div>
  );
}

/** What matching measured people on: share of scored people above 0.5 on each keyword, plus dealbreaker flags. */
function Keywords({ keywords, scored }: { keywords: UniverseDetail["keywords"]; scored: number }) {
  return (
    <Panel className="flex flex-col gap-3 p-[22px]">
      <Caption>keywords · {keywords.length}</Caption>
      <ul className="flex flex-col gap-2.5">
        {keywords.map((k, i) => (
          <li key={k.name} title={k.description ?? undefined} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] leading-4 tracking-[0.08em] lowercase">{k.name}</span>
              <span className="font-mono text-meta leading-3 tracking-[0.1em] whitespace-nowrap text-ink-muted">
                {k.high}
                {k.dealbreakers > 0 && <span className="text-ember-text"> · {k.dealbreakers} avoid</span>}
              </span>
            </div>
            <span className="h-[3px] overflow-hidden rounded-full bg-ink/10">
              <span
                className="draw-bar block h-full rounded-full bg-ink/60"
                style={{ width: `${scored ? (k.high / scored) * 100 : 0}%`, animationDelay: `${i * 40}ms` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-meta leading-3 tracking-label text-ink-muted">
        people scoring above .5, of {scored} scored
      </p>
    </Panel>
  );
}
