import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Caption } from "@/components/admin-ui";
import type { WorldSnapshot } from "@/components/visualizer/world/snapshot";
import { WorldCanvas } from "@/components/visualizer/WorldCanvas";
import { adminApi, ApiError } from "@/lib/api";
import { abortMatching, runMatching } from "../../../actions";
import { fetchWorld, loadPairMessages } from "./actions";

// Organizer view of a whole universe: shows judge rationales and dealbreaker flags for every pair, so it sits
// under /admin (ADMIN_PASSWORD basic auth in src/proxy.ts). Participants use /u/<id>/world instead.
export default function WorldPage({ params }: PageProps<"/admin/universes/[universeId]/world">) {
  return (
    <Suspense fallback={<Caption>opening the world</Caption>}>
      <WorldScreen params={params} />
    </Suspense>
  );
}

async function WorldScreen({ params }: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await params;
  const initial = await adminApi.world(universeId).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    throw e;
  });
  if ("unchanged" in initial) throw new Error("unexpected unchanged snapshot");
  return (
    <WorldCanvas
      initial={initial as WorldSnapshot}
      fetchWorld={fetchWorld.bind(null, universeId)}
      loadMessages={loadPairMessages}
      streamChats
      match={{ run: runMatching.bind(null, universeId), abort: abortMatching.bind(null, universeId) }}
    />
  );
}
