import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { PairConversation } from "@/components/pair-conversation";
import { BackLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function PairPage({ params }: PageProps<"/u/[userId]/pairs/[pairId]">) {
  return (
    <Suspense fallback={null}>
      <PairScreen params={params} />
    </Suspense>
  );
}

async function PairScreen({ params }: { params: Promise<{ userId: string; pairId: string }> }) {
  const { userId, pairId } = await params;
  const pair = await api.pair(userId, pairId).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col md:pt-6">
      <Blobs
        blobs={[
          { color: "ochre", x: "72%", y: "4%", size: 260, opacity: 0.65, blur: 50 },
          { color: "ember", x: "84%", y: "12%", size: 170, opacity: 0.4, blur: 50 },
          { color: "glacier", x: "2%", y: "82%", size: 240, opacity: 0.55, blur: 60 },
        ]}
      />

      <div className="px-5 pt-3">
        <BackLink href={`/u/${userId}/connections`}>connections</BackLink>
      </div>

      <PairConversation pair={pair} userId={userId} />
    </main>
  );
}
