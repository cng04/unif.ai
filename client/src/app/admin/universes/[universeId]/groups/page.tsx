import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, Caption, outline, shortDate } from "@/components/admin-ui";
import { PoolGraph } from "@/components/pool-graph";
import { formatScore } from "@/components/ui";
import { adminApi, ApiError, type UniverseGroups } from "@/lib/api";

export default function GroupsPage({ params, searchParams }: PageProps<"/admin/universes/[universeId]/groups">) {
  return (
    <Suspense fallback={<Caption>loading groups</Caption>}>
      <GroupsScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupsScreen({
  params,
  searchParams,
}: {
  params: Promise<{ universeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ universeId }, query] = await Promise.all([params, searchParams]);
  // Cards by default; ?view=graph shows the pool graph (everyone + every judged chat) instead.
  const graphView = query.view === "graph";
  const pairId = graphView && typeof query.pair === "string" ? query.pair : null;
  const notFoundOn404 = (e: unknown): never => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  };
  const [data, graph, pair] = await Promise.all([
    adminApi.groups(universeId).catch(notFoundOn404),
    graphView ? adminApi.graph(universeId).catch(notFoundOn404) : null,
    pairId ? adminApi.pair(pairId).catch(() => null) : null,
  ]);
  const placed = data.groups.reduce((n, g) => n + g.members.length, 0);

  return (
    <>
      <AdminHeader
        crumbs={["universes", data.name, "groups"]}
        title={data.groups.length ? `groups · ${data.groups.length} formed` : "groups"}
        actions={
          <>
            <ViewToggle universeId={universeId} graph={graphView} />
            {data.groups.length > 0 && (
              <span className="font-mono text-[11px] tracking-label text-ink-muted">
                {placed} placed · {data.leftovers.length} leftover{data.leftovers.length === 1 ? "" : "s"}
              </span>
            )}
            <Link href={`/admin/universes/${universeId}`} className={outline}>
              ← overview
            </Link>
          </>
        }
      />

      {graph ? (
        graph.people.length === 0 ? (
          <Caption className="py-8">nobody has onboarded yet</Caption>
        ) : (
          <PoolGraph data={graph} universeId={universeId} pair={pair} />
        )
      ) : data.groups.length === 0 ? (
        <Caption className="py-8">
          {data.status === "matching" ? "matching is running; groups appear when it finishes" : "no groups yet; run matching from the overview"}
        </Caption>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.groups.map((g, i) => (
              <GroupCard key={g.id} group={g} index={i} />
            ))}
          </div>
          <Leftovers leftovers={data.leftovers} />
        </div>
      )}
    </>
  );
}

function ViewToggle({ universeId, graph }: { universeId: string; graph: boolean }) {
  const base = `/admin/universes/${universeId}/groups`;
  const tab = (on: boolean) =>
    `press rounded-full px-3 py-[5px] font-mono text-[11px] leading-3 tracking-label ${on ? "bg-ink text-paper" : "hover:bg-ink/5"}`;
  return (
    <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="view">
      <Link href={base} className={tab(!graph)} aria-current={!graph ? "page" : undefined}>
        cards
      </Link>
      <Link href={`${base}?view=graph`} className={tab(graph)} aria-current={graph ? "page" : undefined}>
        graph
      </Link>
    </div>
  );
}

function GroupCard({ group: g, index }: { group: UniverseGroups["groups"][number]; index: number }) {
  const weak = g.weakest_tie;
  return (
    <article
      className="rise-in flex flex-col gap-3 rounded-[20px] border border-line bg-white/55 p-[18px] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgb(38_36_31/0.25)]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] leading-3 tracking-label">
          {g.label} · {g.members.length}
        </span>
        {g.group_score != null && (
          <span className="text-[22px] leading-7 font-light tracking-[0.04em]" title="group judge's score, 1-10">
            {Math.round(g.group_score)}
            <span className="text-[13px] text-ink-muted">/10</span>
          </span>
        )}
      </header>
      <p className="font-mono text-[9.5px] leading-3 tracking-label text-ink-muted">
        {weak
          ? `weakest tie · ${weak.a.toLowerCase()}–${weak.b.toLowerCase()} ${formatScore(weak.vibe_score)}`
          : "no judged pairs inside this group"}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {g.members.map((m) => (
          <li key={m.user_id}>
            <a
              href={`/u/${m.user_id}`}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex rounded-full bg-ink/[0.06] px-2.5 py-[5px] text-label leading-3 tracking-label lowercase hover:bg-ink hover:text-paper"
            >
              {m.full_name}
            </a>
          </li>
        ))}
      </ul>
      {g.rationale && (
        <p className="text-[12.5px] leading-[19px] font-light tracking-body">
          <span className="text-ink-muted">✓ judge: </span>
          {g.rationale}
        </p>
      )}
      {g.events.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-3">
          {g.events.map((e) => (
            <li key={e.name} className="font-mono text-[11px] leading-4 tracking-[0.1em]">
              →{" "}
              {e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {e.name.toLowerCase()}
                </a>
              ) : (
                e.name.toLowerCase()
              )}
              <span className="text-ink-muted">
                {[e.starts_at && shortDate(e.starts_at), e.venue?.toLowerCase()].filter(Boolean).map((x) => ` · ${x}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Leftovers({ leftovers }: { leftovers: UniverseGroups["leftovers"] }) {
  return (
    <aside className="flex flex-col gap-3 rounded-[20px] border border-dashed border-ink/30 p-[18px] xl:w-[220px] xl:shrink-0">
      <Caption>leftovers · {leftovers.length}</Caption>
      <p className="text-[12.5px] leading-[19px] font-light tracking-body text-ink-muted">
        Onboarded but not placed: the solver couldn&apos;t fit them in a conflict-free group.
      </p>
      {leftovers.map((p, i) => (
        <a
          key={p.id}
          href={`/u/${p.id}`}
          target="_blank"
          rel="noreferrer"
          className="press rise-in flex items-center gap-2.5 rounded-[12px] border border-line bg-white/45 px-3 py-2.5 hover:bg-white/70"
          style={{ animationDelay: `${200 + i * 50}ms` }}
        >
          <span className="size-[11px] shrink-0 rounded-full border border-dashed border-ink/60" />
          <span className="flex-1 text-[12px] tracking-[0.08em] lowercase">{p.full_name}</span>
          <span className="font-mono text-[10px] tracking-[0.1em] text-ink-muted">
            {p.chats === 0 ? "no chats" : p.strong_ties ? `${p.strong_ties} strong` : `${p.chats} chat${p.chats === 1 ? "" : "s"}`}
          </span>
        </a>
      ))}
    </aside>
  );
}
