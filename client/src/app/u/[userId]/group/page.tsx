import Link from "next/link";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { GroupSteps } from "@/components/group-flow";
import { GroupGraph3D } from "@/components/group-graph-3d-lazy";
import { formatScore, Meta } from "@/components/ui";
import { getGroup } from "@/lib/cached";
import { NoGroupYet } from "./no-group";

export default function GroupRevealPage({ params }: PageProps<"/u/[userId]/group">) {
  return (
    <Suspense fallback={null}>
      <Reveal params={params} />
    </Suspense>
  );
}

async function Reveal({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const group = await getGroup(userId);
  if (!group) return <NoGroupYet userId={userId} />;
  const mates = group.members.length - 1;

  return (
    // Phones: one column. Desktop: text and actions on the left, a big graph on the right.
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col md:grid md:max-w-6xl md:grid-cols-[minmax(0,420px)_1fr] md:grid-rows-[auto_1fr] md:gap-x-12 md:px-10 md:pt-14 md:pb-12">
      <Blobs
        blobs={[
          { color: "ochre", x: "52%", y: "34%", size: 280, opacity: 0.75, blur: 55 },
          { color: "ember", x: "62%", y: "38%", size: 200, opacity: 0.45, blur: 55 },
          { color: "glacier", x: "0%", y: "90%", size: 260, opacity: 0.5, blur: 65 },
        ]}
      />
      <header className="rise-in flex flex-col gap-3 px-6 pt-6 md:col-start-1 md:row-start-1 md:px-0 md:pt-0">
        <Meta>{group.agents_met} agents met</Meta>
        <h1 className="text-[34px] leading-9 font-light tracking-[0.04em] md:text-[52px] md:leading-[56px]">
          you have
          <br />a group.
        </h1>
        <p className="max-w-[300px] text-body font-light tracking-body text-ink-muted">
          Your agent met {group.agents_met} agents. These {mates} are the group you fit best with.
        </p>
      </header>

      <div className="h-[300px] w-full md:col-start-2 md:row-span-2 md:row-start-1 md:h-[min(640px,calc(100dvh-180px))]">
        <GroupGraph3D group={group} />
      </div>

      <div className="flex flex-1 flex-col justify-end gap-[18px] px-5 pt-1 pb-[max(24px,env(safe-area-inset-bottom))] md:col-start-1 md:row-start-2 md:justify-start md:px-0 md:pt-10 md:pb-0">
        <section className="rise-in flex flex-col gap-2.5 rounded-md bg-sheet/80 px-[18px] py-4" style={{ animationDelay: "300ms" }}>
          {group.shared_keywords.length > 0 && (
            <>
              <p className="meta text-ink-muted">what you all share</p>
              <ul className="flex flex-wrap gap-1.5">
                {group.shared_keywords.map((k, i) => (
                  <li key={k} className="pop-in rounded-full bg-ink/[0.07] px-[11px] py-1.5 font-mono text-label leading-3 tracking-[0.08em]" style={{ animationDelay: `${400 + i * 50}ms` }}>
                    {k}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={`flex items-center justify-between ${group.shared_keywords.length ? "border-t border-line pt-1.5" : ""}`}>
            <span className="meta text-ink-muted">group chemistry</span>
            <span className="text-[18px] leading-[22px] font-light">{formatScore(group.group_score)}</span>
          </div>
        </section>
        <Link href={`/u/${userId}/group/meet`} className="press flex justify-center rounded-full bg-ink py-[15px] font-mono text-label leading-3 tracking-label text-sheet">
          meet them →
        </Link>
        <GroupSteps userId={userId} current={1} />
      </div>
    </main>
  );
}
