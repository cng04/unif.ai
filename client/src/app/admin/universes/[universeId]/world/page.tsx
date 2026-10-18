import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, Caption, outline } from "@/components/admin-ui";
import { AutoRefresh } from "@/components/auto-refresh";
import type { WorldData } from "@/components/visualizer/types";
import { WorldCanvas } from "@/components/visualizer/WorldCanvas";
import { adminApi, api, ApiError } from "@/lib/api";
import { loadPairMessages } from "./actions";

// Organizer view of a whole universe: shows judge rationales and dealbreaker flags for every pair, so it sits
// under /admin (ADMIN_PASSWORD basic auth in src/proxy.ts). Participants use /u/<id>.
export default function WorldPage({ params }: PageProps<"/admin/universes/[universeId]/world">) {
  return (
    <Suspense fallback={<Caption>opening the building</Caption>}>
      <WorldScreen params={params} />
    </Suspense>
  );
}

async function WorldScreen({ params }: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await params;
  const data = await loadWorld(universeId);
  const { status } = data.universe;
  return (
    <>
      {status === "matching" && <AutoRefresh seconds={5} />}
      {status === "onboarding" && <AutoRefresh seconds={15} />}
      <AdminHeader
        crumbs={["universes", data.universe.name, "world"]}
        title="agent world"
        subtitle={`${status} · ${data.agents.length} agents · ${data.pairs.length} chats · ${data.groups.length} groups`}
        actions={
          <Link href={`/admin/universes/${universeId}`} className={outline}>
            ← overview
          </Link>
        }
      />
      <WorldCanvas data={data} loadMessages={loadPairMessages} />
    </>
  );
}

/** Everything the world needs, reduced to public profile fields and judge output; contacts and `private` stay here. */
async function loadWorld(universeId: string): Promise<WorldData> {
  const [universe, grouped] = await Promise.all([adminApi.universe(universeId), adminApi.groups(universeId)]).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    throw e;
  });
  const [graph, pairs] = await Promise.all([api.universeGraph(universeId), api.pairs(universeId)]);
  const profiles = await Promise.all(
    universe.members.map((m) => (m.status === "complete" ? api.profile(m.id).catch(() => null) : null)),
  );
  const points = new Map(graph.map((g) => [g.user_id, g]));

  return {
    universe: { id: universe.id, name: universe.name, status: universe.status },
    agents: universe.members.map((m, i) => {
      const pub = profiles[i]?.public;
      const point = points.get(m.id);
      return {
        id: m.id,
        name: m.full_name.split(" ")[0] || m.full_name,
        onboarding: m.status,
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
    groups: grouped.groups.map((g) => ({
      id: g.id,
      label: g.label,
      score: g.group_score,
      rationale: g.rationale,
      memberIds: g.members.map((m) => m.user_id),
      events: g.events.map((e) => ({ name: e.name, url: e.url })),
    })),
  };
}
