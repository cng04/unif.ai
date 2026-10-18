import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Blobs } from "@/components/atmosphere";
import { AutoRefresh } from "@/components/auto-refresh";
import { AxisPicker } from "@/components/axis-picker";
import { ConnectionsGraph } from "@/components/connections-graph";
import { ConnectionsGraph3D } from "@/components/connections-graph-3d-lazy";
import { CountUp } from "@/components/count-up";
import { Glass, Meta, Stat, Title } from "@/components/ui";
import { api, ApiError, type Connections } from "@/lib/api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ConnectionsPage({ params, searchParams }: PageProps<"/u/[userId]/connections">) {
  return (
    <Suspense fallback={<Header title="finding your people" />}>
      <ConnectionsScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ConnectionsScreen({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: SearchParams }) {
  const { userId } = await params;
  const query = await searchParams;
  // ?view=3d swaps the ego graph for the whole universe in 3D; ?axes=a,b,c picks its keyword axes.
  const view = query.view === "3d" ? "3d" : "2d";
  const axes = typeof query.axes === "string" ? query.axes.split(",") : undefined;
  const [data, graph] = await Promise.all([
    api.connections(userId),
    view === "3d"
      ? api.graph(userId, axes).catch((e) => {
          // Stale or hand-edited axes: fall back to the similarity layout.
          if (e instanceof ApiError && e.status === 422) return api.graph(userId);
          throw e;
        })
      : null,
  ]).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const copy = statusCopy(data);
  const strong = data.connections.filter((c) => !c.conflict && (c.vibe_score ?? 0) >= 7).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:pb-10">
      {data.universe.status === "matching" && <AutoRefresh seconds={10} />}
      {/* The warm group colour sits behind "me", which is roughly mid-viewport on every screen size. */}
      <Blobs
        blobs={[
          { color: "ochre", x: "48%", y: "47%", size: 230, opacity: 0.75, blur: 42 },
          { color: "ember", x: "56%", y: "52%", size: 170, opacity: 0.55, blur: 44 },
          { color: "glacier", x: "88%", y: "16%", size: 190, opacity: 0.8 },
          { color: "lichen", x: "4%", y: "78%", size: 190, opacity: 0.5, blur: 48 },
          { color: "periwinkle", x: "94%", y: "88%", size: 200, opacity: 0.6, blur: 48 },
        ]}
      />
      <Header title={copy.title}>
        <ViewToggle userId={userId} view={view} />
      </Header>

      <div className="relative min-h-[360px] flex-1 md:min-h-[460px]">
        <div className="absolute inset-x-0 inset-y-2 md:inset-x-6">
          {graph ? <ConnectionsGraph3D data={graph} userId={userId} /> : <ConnectionsGraph data={data} />}
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 px-5 pt-3 md:mx-auto md:max-w-[520px] md:px-0">
        {graph && (
          <div className="flex justify-center">
            <AxisPicker keywords={graph.keywords} axes={graph.axes} />
          </div>
        )}
        {data.connections.length > 0 && (
          <p className="meta text-center text-ink/70">
            {graph ? "drag to turn · tap a line to read how your agents met" : "tap a line to read how your agents met"}
          </p>
        )}
        <Glass className="flex justify-between px-[18px] py-3.5 md:px-6 md:py-4">
          <Stat value={<CountUp to={data.connections.length} />} label="agents met" />
          <Stat value={<CountUp to={strong} />} label="strong matches" />
          <Stat value={copy.status} label={copy.statusLabel} accent />
        </Glass>
      </div>
    </div>
  );
}

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 px-7 pt-8 md:px-10 md:pt-12">
      <div className="flex flex-col gap-2.5">
        <Meta>your connections</Meta>
        <Title className="max-w-[260px] md:max-w-none">{title}</Title>
      </div>
      {children}
    </header>
  );
}

/** "2d · 3d" pill: just links, so the page stays a server component and the view is shareable. */
function ViewToggle({ userId, view }: { userId: string; view: "2d" | "3d" }) {
  return (
    <nav className="flex shrink-0 rounded-full border border-ink/25 p-0.5" aria-label="graph view">
      {(["2d", "3d"] as const).map((v) => (
        <Link
          key={v}
          href={v === "3d" ? `/u/${userId}/connections?view=3d` : `/u/${userId}/connections`}
          scroll={false}
          aria-current={view === v ? "page" : undefined}
          className={`press micro rounded-full px-3 py-1.5 ${view === v ? "bg-ink text-paper" : "text-ink hover:bg-ink/5"}`}
        >
          {v}
        </Link>
      ))}
    </nav>
  );
}

function statusCopy({ universe, group }: Connections) {
  if (universe.status === "onboarding")
    return { title: "your agent is getting ready", status: "waiting", statusLabel: "matching starts soon" };
  if (universe.status === "matching")
    return { title: "a group is forming around you", status: "forming", statusLabel: "agents are talking" };
  if (group)
    return { title: "a group formed around you", status: "formed", statusLabel: `your group of ${group.members.length}` };
  return { title: "your agent met people", status: "no group", statusLabel: "not placed this round" };
}
