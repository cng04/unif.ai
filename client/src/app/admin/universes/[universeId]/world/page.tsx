import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Caption } from "@/components/admin-ui";
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
      {/* Top bar, stage and overlays follow the Paper "World visualizer" page. */}
      <WorldCanvas data={data} loadMessages={loadPairMessages} />
    </>
  );
}

/** Everything the world needs: public profile fields, matching's keyword vectors and judge output. Contacts and
 * the private profile stay on the server. */
async function loadWorld(universeId: string): Promise<WorldData> {
  const [universe, grouped] = await Promise.all([adminApi.universe(universeId), adminApi.groups(universeId)]).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    throw e;
  });
  const [graph, pairs, scores] = await Promise.all([
    api.universeGraph(universeId),
    api.pairs(universeId),
    adminApi.scores(universeId),
  ]);
  const vectors = new Map(scores.members.map((m) => [m.user_id, m]));
  const profiles = await Promise.all(
    universe.members.map((m) => (m.status === "complete" ? api.profile(m.id).catch(() => null) : null)),
  );
  const points = new Map(graph.map((g) => [g.user_id, g]));

  return {
    universe: { id: universe.id, name: universe.name, status: universe.status },
    agents: universe.members.map((m, i) => {
      const pub = profiles[i]?.public;
      const point = points.get(m.id);
      const vector = vectors.get(m.id);
      return {
        id: m.id,
        name: m.full_name.split(" ")[0] || m.full_name,
        onboarding: m.status,
        interests: (pub?.interests ?? []).slice(0, 10),
        keywords: Object.entries(vector?.scores ?? {})
          .map(([name, score]) => ({ name, score }))
          .sort((a, b) => b.score - a.score),
        dealbreakerKeywords: vector?.dealbreakers ?? [],
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
