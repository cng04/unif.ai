import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WorldCanvas } from "@/components/visualizer/WorldCanvas";
import { api, ApiError } from "@/lib/api";
import { fetchWorld, loadPairMessages } from "./actions";

// A participant's view of their universe's World: everyone's agents and the generated campus, with their own agent
// followed. Hidden things (scores, dealbreakers, judge flags and rationales, other people's chats) never reach it.
export default function ParticipantWorldPage({ params }: PageProps<"/u/[userId]/world">) {
  return (
    <Suspense fallback={<p className="micro p-8 text-ink-muted">( opening the world )</p>}>
      <WorldScreen params={params} />
    </Suspense>
  );
}

async function WorldScreen({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const initial = await api.userWorld(userId).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 422)) notFound();
    if (e instanceof ApiError && e.status === 504) return null;
    throw e;
  });
  if (initial == null) return <p className="micro p-8 text-ink-muted">( the world took too long to open. refresh in a moment. )</p>;
  if ("unchanged" in initial) throw new Error("unexpected unchanged snapshot");
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-4 py-6 md:px-8">
      <WorldCanvas initial={initial} fetchWorld={fetchWorld.bind(null, userId)} loadMessages={loadPairMessages.bind(null, userId)} />
    </main>
  );
}
