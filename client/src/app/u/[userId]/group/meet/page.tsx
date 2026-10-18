import Link from "next/link";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { GroupSteps, sharedLine } from "@/components/group-flow";
import { formatScore } from "@/components/ui";
import { getGroup } from "@/lib/cached";
import { NoGroupYet } from "../no-group";

export default function MeetThemPage({ params }: PageProps<"/u/[userId]/group/meet">) {
  return (
    <Suspense fallback={null}>
      <MeetThem params={params} />
    </Suspense>
  );
}

async function MeetThem({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const group = await getGroup(userId);
  if (!group) return <NoGroupYet userId={userId} />;
  const mates = group.members.filter((m) => !m.is_me);

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col md:max-w-4xl md:px-10 md:pt-14 md:pb-12">
      <Blobs
        blobs={[
          { color: "ochre", x: "52%", y: "26%", size: 280, opacity: 0.6, blur: 55 },
          { color: "glacier", x: "0%", y: "88%", size: 260, opacity: 0.45, blur: 65 },
        ]}
      />
      <header className="flex flex-col gap-2.5 px-6 pt-6 pb-[18px] md:px-0 md:pt-0 md:pb-8">
        <div className="flex justify-between font-mono text-meta leading-3 tracking-meta text-ink-muted">
          <Link href={`/u/${userId}/group`} className="hover:text-ink">
            ← ( your group · {group.members.length} )
          </Link>
          <span>1 of 3</span>
        </div>
        <h1 className="text-title lh-32 font-light tracking-[0.12em] md:text-[34px] md:leading-10">meet them</h1>
        <p className="fs-13 lh-19 text-ink-muted">What you have in common with each of them, and how they&apos;d introduce themselves.</p>
      </header>

      {/* Two cards per row on desktop. */}
      <ul className="flex flex-col gap-2.5 px-5 md:grid md:grid-cols-2 md:gap-4 md:px-0">
        {mates.map((m, i) => {
          const why = sharedLine(m.shared_keywords);
          return (
            <li key={m.user_id} className="rise-in flex flex-col gap-2.5 rounded-md bg-sheet/80 px-[18px] py-4" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 shrink-0 rounded-full bg-ink" />
                <span className="fs-16 leading-5 tracking-[0.08em] lowercase">{m.full_name}</span>
                <span className="flex-1" />
                <span className="font-mono text-label leading-3 tracking-[0.08em]" title={m.vibe_score == null ? "your agents didn't talk directly" : "how your agents' chat went"}>
                  {formatScore(m.vibe_score)}
                </span>
              </div>
              <p className="fs-13 lh-19">{why ?? "Your agents didn't talk directly; the group brought you together."}</p>
              {m.intro && (
                <blockquote className="border-l-2 border-ember pl-3 fs-13 lh-19 text-ink-muted">&ldquo;{m.intro}&rdquo;</blockquote>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-3 px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] md:mx-auto md:mt-0 md:w-full md:max-w-[420px] md:px-0 md:pt-10 md:pb-0">
        <Link href={`/u/${userId}/group/plans`} className="press flex justify-center rounded-full bg-ink py-3.5 font-mono text-label leading-3 tracking-label text-sheet">
          pick a plan →
        </Link>
        <Link href={`/u/${userId}/agent`} className="text-center font-mono text-meta leading-3 tracking-meta text-ink-faint hover:text-ink-muted">
          not feeling it? tell your agent, privately
        </Link>
        <GroupSteps userId={userId} current={1} />
      </div>
    </main>
  );
}
