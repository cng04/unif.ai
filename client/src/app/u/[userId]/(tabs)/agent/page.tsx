import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { ChatInput } from "@/components/chat-input";
import { Bubble, PillLink } from "@/components/ui";
import { api, ApiError, type UniverseStatus } from "@/lib/api";
import { sendToAgent } from "./actions";

export default function AgentPage({ params }: PageProps<"/u/[userId]/agent">) {
  return (
    <Suspense fallback={null}>
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
  const [data, transcript] = await Promise.all([api.connections(userId), api.interview(userId)]).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  return (
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
          <span className="text-[13px] leading-4 tracking-label">your agent</span>
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
            className={`rise-in ${m.role === "user" ? "max-w-[280px] self-end md:max-w-[420px]" : "max-w-[300px] md:max-w-[440px]"}`}
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
          <p className="rounded-full border border-line bg-paper/70 px-5 py-3 text-center text-[12.5px] leading-[18px] font-light tracking-body text-ink-muted backdrop-blur-md">
            finish setting up with your agent in iMessage. you can chat here once you&apos;re done.
          </p>
        )}
      </div>
    </main>
  );
}
