import Link from "next/link";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { GroupSteps } from "@/components/group-flow";
import { PlanVote } from "@/components/plan-vote";
import type { UserGroup, UserPlan } from "@/lib/api";
import { getGroup } from "@/lib/cached";
import { setVote } from "../actions";
import { NoGroupYet } from "../no-group";

export default function PlansPage({ params }: PageProps<"/u/[userId]/group/plans">) {
  return (
    <Suspense fallback={null}>
      <Plans params={params} />
    </Suspense>
  );
}

// The event search runs after matching and stores up to 3 plans per group, best first (see services/event_search.py).
async function Plans({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const group = await getGroup(userId);
  if (!group) return <NoGroupYet userId={userId} />;
  const [top, ...rest] = group.events;
  const chosen = group.events.find((e) => e.chosen);
  const vote = { userId, group };

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col md:max-w-5xl md:px-10 md:pt-14 md:pb-12">
      <Blobs
        blobs={[
          { color: "ochre", x: "60%", y: "30%", size: 280, opacity: 0.55, blur: 55 },
          { color: "periwinkle", x: "4%", y: "86%", size: 240, opacity: 0.4, blur: 65 },
        ]}
      />
      <header className="flex flex-col gap-2.5 px-6 pt-6 pb-[18px] md:px-0 md:pt-0 md:pb-8">
        <div className="flex justify-between font-mono text-meta leading-3 tracking-meta text-ink-muted">
          <Link href={`/u/${userId}/group/meet`} className="hover:text-ink">
            ← meet them
          </Link>
          <span>2 of 3</span>
        </div>
        <h1 className="text-title lh-32 font-light tracking-[0.12em] md:text-[34px] md:leading-10">pick a plan</h1>
        <p className="fs-13 lh-19 text-ink-muted">
          {group.plans_summary ?? "Your event agent looked for things your whole group would be up for."}
          {!chosen && group.events.length > 0 && ` Tap "i'm in" on any you'd go to. Once ${group.votes_needed} of you are in on one, it's on and everyone gets a text.`}
        </p>
      </header>

      {chosen && (
        <Link
          href={`/u/${userId}/group/show-up`}
          className="press mx-5 mb-4 flex items-center justify-between rounded-md bg-ink px-[18px] py-4 text-sheet md:mx-0 md:mb-6"
        >
          <span className="flex flex-col gap-1">
            <span className="fs-15 leading-5 font-light tracking-[0.06em]">it&apos;s on: {chosen.name.toLowerCase()}</span>
            <span className="font-mono text-meta leading-3 tracking-meta text-sheet/70">{chosen.voters.length} of {group.members.length} in · see the plan</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {/* Desktop: the top pick takes the left column, the others stack on the right. */}
      <div className="flex flex-col gap-2.5 px-5 md:grid md:grid-cols-[1.25fr_1fr] md:items-start md:gap-4 md:px-0">
        {group.plans_status === "pending" && group.events.length === 0 && <Note>your event agent is still looking. check back soon.</Note>}
        {group.plans_status === "none" && group.events.length === 0 && <Note>nothing fit everyone this time. your agent will keep looking.</Note>}
        {top && <PlanCard plan={top} rank={1} featured {...vote} />}
        {rest.map((p, i) => (
          <PlanCard key={p.id} plan={p} rank={i + 2} {...vote} />
        ))}
      </div>

      <div className="mt-auto px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] md:px-0 md:pt-10 md:pb-0">
        <GroupSteps userId={userId} current={2} reached={chosen ? 3 : 2} />
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  rank,
  featured,
  userId,
  group,
}: {
  plan: UserPlan;
  rank: number;
  featured?: boolean;
  userId: string;
  group: UserGroup;
}) {
  const meta = [plan.time_label, plan.venue?.toLowerCase(), plan.price].filter(Boolean).join(" · ");
  const lockedElsewhere = group.chosen_event_id !== null && !plan.chosen;
  return (
    <article
      className={`rise-in flex flex-col gap-2 rounded-md px-[18px] py-4 ${featured ? "bg-sheet shadow-[0_8px_24px_-16px_rgb(38_36_31/0.35)] md:row-span-2 md:self-stretch md:gap-3 md:p-7" : "border border-line bg-white/45"} ${lockedElsewhere ? "opacity-55" : ""}`}
      style={{ animationDelay: `${rank * 80}ms` }}
    >
      <div className="flex justify-between font-mono text-meta leading-3 tracking-meta text-ink-muted">
        <span>
          0{rank}
          {plan.chosen ? " · it's on" : featured ? " · top pick" : ""}
        </span>
        <span>via {plan.source}</span>
      </div>
      <h2 className={`font-light tracking-[0.08em] lowercase ${featured ? "fs-22 leading-7" : "fs-16 leading-6"}`}>{plan.name}</h2>
      {meta && <p className="font-mono text-label leading-3 tracking-[0.1em]">{meta}</p>}
      {plan.reason && <p className="fs-13 lh-19 font-light text-ink-muted">{plan.reason}</p>}
      {plan.url && (
        <a href={plan.url} target="_blank" rel="noreferrer" className="press self-start rounded-full border border-ink/25 px-4 py-2 font-mono text-label leading-3 tracking-label hover:bg-ink/5">
          details ↗
        </a>
      )}
      <PlanVote
        action={setVote.bind(null, userId, plan.id)}
        going={plan.voters.length}
        size={group.members.length}
        needed={group.votes_needed}
        mine={plan.voters.includes(userId)}
        locked={lockedElsewhere}
      />
    </article>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-ink/25 px-[18px] py-4 font-mono fs-10.5 leading-4 tracking-label text-ink-muted">{children}</p>;
}
