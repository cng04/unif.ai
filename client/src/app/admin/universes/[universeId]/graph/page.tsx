import { redirect } from "next/navigation";

// The pool graph now lives in the groups tab as a toggle; keep old links working.
export default async function PoolGraphPage({ params, searchParams }: PageProps<"/admin/universes/[universeId]/graph">) {
  const [{ universeId }, query] = await Promise.all([params, searchParams]);
  const pair = typeof query.pair === "string" ? `&pair=${encodeURIComponent(query.pair)}` : "";
  redirect(`/admin/universes/${universeId}/groups?view=graph${pair}`);
}
