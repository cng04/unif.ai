import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { ChatInput } from "@/components/chat-input";
import { AgentSkeleton, Bubble, PillLink, Stat } from "@/components/ui";
import type { Connections, Profile, UniverseStatus } from "@/lib/api";
import { getConnections, getInterview, getProfile } from "@/lib/cached";
import { sendToAgent } from "./actions";

export default function AgentPage({ params }: PageProps<"/u/[userId]/agent">) {
  return (
    <Suspense fallback={<AgentSkeleton />}>
      <AgentScreen params={params} />
    </Suspense>
  );
}

const statusLabel: Record<UniverseStatus, string> = {
  onboarding: "getting ready",
  matching: "matching",
  matched: "matched",
};

async function AgentScreen({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [data, transcript, profile] = await Promise.all([getConnections(userId), getInterview(userId), getProfile(userId)]);
  if (!data || !transcript) notFound();

  return (
    // Desktop (lg): the chat keeps its reading width and a sidebar fills the space beside it.
    <div className="mx-auto flex w-full flex-1 lg:grid lg:max-w-[1040px] lg:grid-cols-[minmax(0,640px)_300px] lg:gap-10 lg:px-6">
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col md:pt-6">
      <Blobs
        blobs={[
          { color: "glacier", x: "10%", y: "10%", size: 240, opacity: 0.5, blur: 60 },
          { color: "ochre", x: "98%", y: "55%", size: 220, opacity: 0.35, blur: 60 },
        ]}
      />

      {/* Stays put while the chat scrolls: at the top on phones, under the desktop tab bar on wider screens. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/70 px-5 pt-5 pb-4 backdrop-blur-md md:top-[88px]">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-ink/40">
          <span className="size-3 rounded-full bg-ink" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="fs-13 leading-4 tracking-label">your agent</span>
          <span className="micro flex items-center gap-1.5 text-ink-muted">
            {data.universe.status === "matching" && <span className="size-[5px] rounded-full bg-ember" />}
            {statusLabel[data.universe.status]} · {data.connections.length} met
          </span>
        </div>
        <PillLink href={`/u/${userId}/you`}>what i know</PillLink>
      </header>

      <section className="flex flex-1 flex-col gap-3.5 px-5 pt-5 pb-4">
        {transcript.length === 0 && (
          <p className="micro py-6 text-center text-ink-muted">
            ( {data.onboarded ? "say hi to your agent" : "your onboarding chat will show up here"} )
          </p>
        )}
        {transcript.map((m, i) => (
          <div
            key={i}
            // Only the latest few messages animate, so a long history doesn't take ages to appear.
            style={{ animationDelay: `${Math.max(0, i - (transcript.length - 6)) * 90}ms` }}
            className={`rise-in max-w-[82%] ${m.role === "user" ? "ml-[18%] self-end" : "mr-[18%] self-start"}`}
          >
            <Bubble side={m.role === "user" ? "you" : "them"}>{m.content}</Bubble>
          </div>
        ))}
      </section>

      {/* Stays reachable while scrolling a long chat: above the mobile tab bar, at the bottom on desktop. */}
      <div className="sticky bottom-[86px] z-10 px-5 pt-2 md:bottom-0 md:pb-8">
        {data.onboarded ? (
          <ChatInput action={sendToAgent.bind(null, userId)} placeholder="message your agent…" />
        ) : (
          // Onboarding only happens in iMessage / ASI:One; this tab mirrors it until the profile is saved.
          <p className="rounded-full border border-line bg-paper/70 px-5 py-3 text-center fs-12.5 lh-18 font-light tracking-body text-ink-muted backdrop-blur-md">
            finish setting up with your agent in iMessage. you can chat here once you&apos;re done.
          </p>
        )}
      </div>
    </main>
    <AgentSidebar userId={userId} data={data} profile={profile} />
    </div>
  );
}

/** Desktop-only context next to the chat: where your agent is at, your group, and a peek at what it knows. */
function AgentSidebar({ userId, data, profile }: { userId: string; data: Connections; profile: Profile | null }) {
  const strong = data.connections.filter((c) => !c.conflict && (c.vibe_score ?? 0) >= 7).length;
  const interests = profile?.public.interests.slice(0, 8) ?? [];
  return (
    <aside className="sticky top-[112px] hidden flex-col gap-4 self-start pt-6 lg:flex">
      <section className="flex flex-col gap-3 rounded-md border border-line bg-white/45 px-5 py-4">
        <p className="micro text-ink-muted">( your agent )</p>
        <p className="flex items-center gap-2 fs-15 leading-5 font-light tracking-[0.04em]">
          {data.universe.status === "matching" && <span className="size-[6px] rounded-full bg-ember" />}
          {statusLabel[data.universe.status]}
        </p>
        <div className="flex gap-6">
          <Stat value={data.connections.length} label="agents met" />
          <Stat value={strong} label="strong matches" />
        </div>
      </section>

      {data.group && (
        <Link href={`/u/${userId}/group`} className="press flex flex-col gap-2.5 rounded-md bg-ink px-5 py-4 text-paper">
          <span className="micro text-paper/70">( your group · {data.group.members.length} )</span>
          <span className="fs-13 lh-19 tracking-[0.06em] lowercase">
            {data.group.members.filter((m) => m.user_id !== userId).map((m) => m.full_name).join(", ")}
          </span>
          <span className="font-mono text-label tracking-label">meet them →</span>
        </Link>
      )}

      {profile && (interests.length > 0 || profile.public.looking_for) && (
        <section className="flex flex-col gap-3 rounded-md border border-line bg-white/45 px-5 py-4">
          <p className="micro text-ink-muted">( what i know )</p>
          {profile.public.looking_for && (
            <p className="fs-13 lh-19 font-light">{profile.public.looking_for}</p>
          )}
          {interests.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {interests.map((t) => (
                <li key={t} className="rounded-full border border-ink/20 px-2.5 py-1 fs-10.5 tracking-label lowercase">
                  {t}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/u/${userId}/you`} className="font-mono text-label tracking-label text-ink-muted hover:text-ink">
            everything it knows →
          </Link>
        </section>
      )}
    </aside>
  );
}
