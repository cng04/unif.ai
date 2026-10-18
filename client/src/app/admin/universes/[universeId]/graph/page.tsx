import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader, Caption } from "@/components/admin-ui";
import { PoolGraph } from "@/components/pool-graph";
import { adminApi, ApiError } from "@/lib/api";

export default function PoolGraphPage({ params, searchParams }: PageProps<"/admin/universes/[universeId]/graph">) {
  return (
    <Suspense fallback={<Caption>loading pool graph</Caption>}>
      <GraphScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GraphScreen({
  params,
  searchParams,
}: {
  params: Promise<{ universeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ universeId }, query] = await Promise.all([params, searchParams]);
  const pairId = typeof query.pair === "string" ? query.pair : null;
  const [data, pair] = await Promise.all([
    adminApi.graph(universeId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }),
    pairId ? adminApi.pair(pairId).catch(() => null) : null,
  ]);
  return (
    <>
      <AdminHeader crumbs={["universes", data.name, "pool graph"]} title="pool graph" />
      {data.people.length === 0 ? (
        <Caption className="py-8">nobody has onboarded yet</Caption>
      ) : (
        <PoolGraph data={data} universeId={universeId} pair={pair} />
      )}
    </>
  );
}
