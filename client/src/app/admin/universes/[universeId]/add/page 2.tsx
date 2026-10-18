import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddPerson } from "@/components/add-person";
import { AdminHeader, Caption, outline } from "@/components/admin-ui";
import { adminApi, ApiError } from "@/lib/api";

export default function AddPersonPage({ params }: PageProps<"/admin/universes/[universeId]/add">) {
  return (
    <Suspense fallback={<Caption>loading universe</Caption>}>
      <AddPersonScreen params={params} />
    </Suspense>
  );
}

async function AddPersonScreen({ params }: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await params;
  const universe = await adminApi.universe(universeId).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  return (
    <>
      <AdminHeader
        crumbs={["universes", universe.name, "add person"]}
        title="meet someone new"
        subtitle={`${universe.stats.members} in ${universe.name.toLowerCase()} · a quick chat becomes their agent`}
        actions={
          <Link href={`/admin/universes/${universeId}`} className={outline}>
            ← overview
          </Link>
        }
      />
      <AddPerson universeId={universeId} matching={universe.status === "matching"} />
    </>
  );
}
