import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Blobs } from "@/components/atmosphere";
import { AutoRefresh } from "@/components/auto-refresh";
import { AxisPicker } from "@/components/axis-picker";
import { ConnectionsGraph } from "@/components/connections-graph";
import { ConnectionsGraph3D } from "@/components/connections-graph-3d-lazy";
import { PairConversation } from "@/components/pair-conversation";
import { PairDrawer } from "@/components/pair-drawer";
import { CountUp } from "@/components/count-up";
import { Glass, Meta, Stat, Title } from "@/components/ui";
import { api, ApiError, type Connections } from "@/lib/api";
import { getConnections, getGraph } from "@/lib/cached";

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
  // 3D (the whole universe) by default; ?view=2d is the ego graph. ?axes=a,b,c picks the 3D keyword axes,
  // and ?pair=<id> opens that agent conversation in the drawer.
  const view = query.view === "2d" ? "2d" : "3d";
  const axes = typeof query.axes === "string" ? query.axes.split(",") : undefined;
  const pairId = typeof query.pair === "string" ? query.pair : null;
  const [data, graph, pair] = await Promise.all([
    getConnections(userId),
    view === "3d" ? getGraph(userId, axes) : null,
    // A stale or someone else's pair id just means no drawer.
    pairId ? api.pair(userId, pairId).catch((e) => (e instanceof ApiError && [404, 422].includes(e.status) ? null : Promise.reject(e))) : null,
  ]);
  if (!data || (view === "3d" && !graph)) notFound();
  const copy = statusCopy(data);
  const strong = data.connections.filter((c) => !c.conflict && (c.vibe_score ?? 0) >= 7).length;

  return (
    <div
      className={`mx-auto flex w-full max-w-6xl flex-1 flex-col transition-[margin] duration-300 ease-out md:pb-10 ${
        // Desktop: make room for the drawer (460px + 12px insets) and re-centre in what's left.
        pair ? "md:mr-[484px] md:ml-[max(0px,calc((100vw_-_484px_-_72rem)/2))]" : ""
      }`}
    >
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
          {graph ? <ConnectionsGraph3D data={graph} /> : <ConnectionsGraph data={data} />}
        </div>
        {/* Desktop: the axis legend floats in the graph's corner; phones get it below the graph. */}
        {graph && <AxisPicker keywords={graph.keywords} axes={graph.axes} className="absolute bottom-4 left-10 z-10 hidden md:flex" />}
      </div>

      <div className="flex w-full flex-col gap-4 px-5 pt-3 md:mx-auto md:max-w-[520px] md:px-0">
        {graph && <AxisPicker keywords={graph.keywords} axes={graph.axes} className="mx-auto md:hidden" />}
        {/* Always the head count; once agents have met, also how to open their conversations. */}
        <p className="text-center font-mono text-[10.5px] leading-4 tracking-[0.12em] text-ink/70 md:text-[11px]">
          {data.others.length} {data.others.length === 1 ? "other" : "others"} in the universe
          {data.connections.length > 0 && " · tap a line or a name to read how your agents met"}
        </p>
        <Glass className="flex justify-between px-[18px] py-3.5 md:px-6 md:py-4">
          <Stat value={<CountUp to={data.connections.length} />} label="agents met" />
          <Stat value={<CountUp to={strong} />} label="strong matches" />
          <Stat value={copy.status} label={copy.statusLabel} accent />
        </Glass>
      </div>

      {pair && (
        <PairDrawer key={pair.id}>
          <PairConversation pair={pair} userId={userId} />
        </PairDrawer>
      )}
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
          href={v === "2d" ? `/u/${userId}/connections?view=2d` : `/u/${userId}/connections`}
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
