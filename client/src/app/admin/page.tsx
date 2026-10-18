import Link from "next/link";
import { Suspense } from "react";
import { CreateUniverseForm } from "@/components/admin-forms";
import { AdminHeader, Caption, Panel, shortDate } from "@/components/admin-ui";
import { adminApi } from "@/lib/api";
import { createUniverse } from "./actions";

export default function UniversesPage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <AdminHeader crumbs={["universes"]} title="universes" subtitle="each universe is a group of people who get matched into friend groups" />
      <Panel className="flex flex-col gap-3 px-6 py-5">
        <Caption>new universe</Caption>
        <CreateUniverseForm action={createUniverse} />
      </Panel>
      <Suspense fallback={<Caption>loading universes</Caption>}>
        <UniverseList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UniverseList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const mode = (await searchParams).mode === "demo" ? "demo" : "real";
  const universes = await adminApi.universes(mode);
  const tabs = (
    <div className="flex gap-3.5 pb-3 font-mono text-[10px] leading-3 tracking-label">
      {(["real", "demo"] as const).map((m) => (
        <Link key={m} href={m === "real" ? "/admin" : "/admin?mode=demo"} className={m === mode ? "underline underline-offset-4" : "text-ink-muted hover:text-ink"}>
          {m === "real" ? "real universes" : "demo & test data"}
        </Link>
      ))}
    </div>
  );
  if (universes.length === 0)
    return (
      <section>
        {tabs}
        <Caption>{mode === "demo" ? "no demo universes; run scripts.seed_demo or scripts.seed_synthetic" : "no universes yet"}</Caption>
      </section>
    );
  return (
    <section className="flex flex-col">
      {tabs}
      <Caption className="pb-3">{mode === "demo" ? "demo & test universes" : "all universes"} · {universes.length}</Caption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-ink/25">
              {["name", "status", "onboarded", "groups", "created", "world"].map((h) => (
                <th key={h} className="py-2 pr-4 font-mono text-meta leading-3 font-normal tracking-label text-ink-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {universes.map((p, i) => (
              <tr
                key={p.id}
                className="rise-in border-b border-line transition-colors hover:bg-white/30"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <td className="py-[11px] pr-4">
                  <Link href={`/admin/universes/${p.id}`} className="text-[12.5px] leading-4 tracking-[0.08em] lowercase hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="pr-4 font-mono text-[10px] tracking-[0.1em]">
                  <span className={p.status === "matching" ? "text-ember-text" : ""}>{p.status}</span>
                </td>
                <td className="pr-4 font-mono text-[10px] tracking-[0.1em]">
                  {p.onboarded} / {p.members}
                </td>
                <td className="pr-4 font-mono text-[10px] tracking-[0.1em]">{p.groups || "—"}</td>
                <td className="pr-4 font-mono text-[10px] tracking-[0.1em] text-ink-muted">{shortDate(p.created_at)}</td>
                <td className="font-mono text-[10px] tracking-[0.1em]">
                  <Link href={`/admin/universes/${p.id}/world`} className="hover:underline">
                    world →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
