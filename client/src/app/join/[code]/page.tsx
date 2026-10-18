import type { Metadata } from "next";
import { Suspense } from "react";
import { Blobs } from "@/components/atmosphere";
import { JoinFlow } from "@/components/join-flow";
import { Meta, Title } from "@/components/ui";
import { ApiError, joinApi } from "@/lib/api";
import { joinPool } from "./actions";

export const metadata: Metadata = { title: "join · unif.ai" };

export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-7 px-7 pt-12 pb-[max(40px,env(safe-area-inset-bottom))] md:max-w-5xl md:px-10 md:pt-24">
      <Blobs
        blobs={[
          { color: "ochre", x: "70%", y: "12%", size: 260, opacity: 0.6, blur: 55 },
          { color: "ember", x: "86%", y: "22%", size: 160, opacity: 0.35, blur: 50 },
          { color: "periwinkle", x: "6%", y: "82%", size: 230, opacity: 0.4, blur: 60 },
        ]}
      />
      <Suspense fallback={<Meta>you&apos;re invited</Meta>}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = await joinApi.invite(code).catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });

  if (!invite) {
    return (
      <Header meta="unif.ai" title="this invite link isn't valid">
        Double-check the link you were sent, or ask whoever invited you for a new one.
      </Header>
    );
  }
  if (!invite.open) {
    return (
      <Header meta={invite.name} title="this group is closed">
        It&apos;s no longer taking new members.
      </Header>
    );
  }
  return (
    // Desktop: the pitch on the left, the ways to join on the right.
    <div className="flex flex-col gap-7 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-start md:gap-16">
      <Header meta="you're invited" title={`join ${invite.name}`}>
        Our agent will chat with you for about 10 minutes to get to know you, then match you into a small friend
        group of 3–8 people.
      </Header>
      <div className="flex flex-col gap-7">
        <JoinFlow invite={invite} action={joinPool.bind(null, code)} />
      </div>
    </div>
  );
}

function Header({ meta, title, children }: { meta: string; title: string; children: React.ReactNode }) {
  return (
    <header className="rise-in flex flex-col gap-3">
      <Meta>{meta.toLowerCase()}</Meta>
      <Title className="text-[26px] leading-9 md:text-[44px] md:leading-[52px]">{title}</Title>
      <p className="text-body font-light tracking-body text-ink-muted">{children}</p>
    </header>
  );
}
