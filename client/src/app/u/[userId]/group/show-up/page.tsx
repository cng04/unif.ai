import Link from "next/link";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { GroupSteps } from "@/components/group-flow";
import { getGroup } from "@/lib/cached";
import { NoGroupYet } from "../no-group";

export default function ShowUpPage({ params }: PageProps<"/u/[userId]/group/show-up">) {
  return (
    <Suspense fallback={null}>
      <ShowUp params={params} />
    </Suspense>
  );
}

// The plan a majority of the group said "i'm in" to (see set_vote in server/app/matching/plans.py).
async function ShowUp({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const group = await getGroup(userId);
  if (!group) return <NoGroupYet userId={userId} />;
  const plan = group.events.find((e) => e.chosen);
  const names = new Map(group.members.map((m) => [m.user_id, m.is_me ? "you" : m.full_name.toLowerCase()]));

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col md:max-w-2xl md:px-10 md:pt-14 md:pb-12">
      <Blobs
        blobs={[
          { color: "ember", x: "58%", y: "30%", size: 260, opacity: 0.45, blur: 55 },
          { color: "ochre", x: "40%", y: "40%", size: 240, opacity: 0.5, blur: 60 },
          { color: "glacier", x: "0%", y: "90%", size: 240, opacity: 0.4, blur: 65 },
        ]}
      />
      <header className="flex flex-col gap-2.5 px-6 pt-6 pb-[18px] md:px-0 md:pt-0 md:pb-8">
        <div className="flex justify-between font-mono text-meta leading-3 tracking-meta text-ink-muted">
          <Link href={`/u/${userId}/group/plans`} className="hover:text-ink">
            ← pick a plan
          </Link>
          <span>3 of 3</span>
        </div>
        <h1 className="text-title lh-32 font-light tracking-[0.12em] md:text-[34px] md:leading-10">
          {plan ? "it's on." : "no plan yet"}
        </h1>
        <p className="fs-13 lh-19 text-ink-muted">
          {plan
            ? "Your group locked this one in. Everyone got a text with the details."
            : `Once ${group.votes_needed} of you are in on a plan, it shows up here and everyone gets a text.`}
        </p>
      </header>

      {plan ? (
        <article className="rise-in mx-5 flex flex-col gap-3 rounded-md bg-sheet px-[18px] py-5 shadow-[0_8px_24px_-16px_rgb(38_36_31/0.35)] md:mx-0 md:p-7">
          <h2 className="text-[24px] leading-8 font-light tracking-[0.08em] lowercase">{plan.name}</h2>
          <dl className="flex flex-col gap-2 font-mono text-label leading-4 tracking-[0.1em]">
            {plan.time_label && <Detail label="when">{plan.time_label}</Detail>}
            {plan.venue && <Detail label="where">{plan.venue.toLowerCase()}</Detail>}
            {plan.price && <Detail label="cost">{plan.price}</Detail>}
          </dl>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="micro text-ink-muted">
              {plan.voters.length} of {group.members.length} in
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {plan.voters.map((id) => (
                <li key={id} className="rounded-full bg-ink/[0.07] px-[11px] py-1.5 font-mono text-label leading-3 tracking-[0.08em]">
                  {names.get(id) ?? "someone"}
                </li>
              ))}
            </ul>
          </div>
          {plan.url && (
            <a href={plan.url} target="_blank" rel="noreferrer" className="press self-start rounded-full bg-ink px-4 py-2.5 font-mono text-label leading-3 tracking-label text-sheet">
              details ↗
            </a>
          )}
        </article>
      ) : (
        <Link
          href={`/u/${userId}/group/plans`}
          className="press mx-5 self-start rounded-full border border-ink/25 px-4 py-2.5 fs-11.5 tracking-meta md:mx-0"
        >
          ← see the plans
        </Link>
      )}

      <div className="mt-auto px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] md:px-0 md:pt-10 md:pb-0">
        <GroupSteps userId={userId} current={3} />
      </div>
    </main>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-12 text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
