import { redirect } from "next/navigation";
import { Suspense } from "react";

// The pool graph now lives in the groups tab as a toggle; keep old links working.
export default function PoolGraphPage({ params, searchParams }: PageProps<"/admin/universes/[universeId]/graph">) {
  // params and searchParams are request-time data, so they're read inside a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <GraphRedirect params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GraphRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ universeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<null> {
  const [{ universeId }, query] = await Promise.all([params, searchParams]);
  const pair = typeof query.pair === "string" ? `&pair=${encodeURIComponent(query.pair)}` : "";
  redirect(`/admin/universes/${universeId}/groups?view=graph${pair}`);
}
