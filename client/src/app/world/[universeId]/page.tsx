import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Meta, Title } from "@/components/ui";
import type { WorldData } from "@/components/visualizer/types";
import { WorldCanvas } from "@/components/visualizer/WorldCanvas";
import { api, ApiError } from "@/lib/api";
import { loadPairMessages } from "./actions";

// Organizer view of a whole universe. It shows judge rationales and dealbreaker flags for every pair, so
// `src/proxy.ts` puts it behind ADMIN_PASSWORD; participants use /u/<id> instead.
export default function WorldPage({ params }: PageProps<"/world/[universeId]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-4 px-4 pt-8 pb-10 md:px-6">
      <Suspense fallback={<Header title="opening the building" />}>
        <World params={params} />
      </Suspense>
    </main>
  );
}

async function World({ params }: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await params;
  const data = await loadWorld(universeId);
  return (
    <>
      {data.universe.status === "matching" && <AutoRefresh seconds={5} />}
      <Header title={data.universe.name} status={data.universe.status} />
      <WorldCanvas data={data} loadMessages={loadPairMessages} />
    </>
  );
}

function Header({ title, status }: { title: string; status?: WorldData["universe"]["status"] }) {
  return (
    <header className="flex flex-col gap-2">
      <Meta>agent world{status ? ` · ${status}` : ""}</Meta>
      <Title>{title}</Title>
    </header>
  );
}

/** Everything the world needs, reduced to public profile fields and judge output the API already exposes. */
async function loadWorld(universeId: string): Promise<WorldData> {
  const universe = await api.universe(universeId).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    throw e;
  });
  const [users, graph, pairs, groups] = await Promise.all([
    api.users(universeId),
    api.graph(universeId),
    api.pairs(universeId),
    api.groups(universeId),
  ]);
  // Profiles hold a private section; only the public fields below leave the server.
  const profiles = await Promise.all(users.map((u) => api.profile(u.id).catch(() => null)));
  const points = new Map(graph.map((g) => [g.user_id, g]));

  return {
    universe: { id: universe.id, name: universe.name, status: universe.status },
    agents: users.map((u, i) => {
      const pub = profiles[i]?.public;
      const point = points.get(u.id);
      return {
        id: u.id,
        name: u.full_name.split(" ")[0] || u.full_name,
        interests: (pub?.interests ?? []).slice(0, 10),
        vibe: pub?.vibe || null,
        lookingFor: pub?.looking_for || null,
        scored: Boolean(point),
        point: point ? [point.x, point.y, point.z] : null,
      };
    }),
    pairs: pairs.map((p) => ({
      id: p.id,
      a: p.user_a,
      b: p.user_b,
      vibe: p.vibe_score,
      logistics: p.logistics_fit,
      dealbreakerFlags: p.dealbreaker_flags,
      rationale: p.judge_rationale,
    })),
    groups: groups.map((g) => ({
      id: g.id,
      score: g.group_score,
      rationale: g.rationale,
      memberIds: g.members.map((m) => m.user_id),
      events: g.events.map((e) => ({ name: e.name, url: e.url })),
    })),
  };
}
