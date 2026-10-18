import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Blobs } from "@/components/atmosphere";
import { LookEditor } from "@/components/look-editor";
import { Meta, ProfileSkeleton, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { getConnections, getProfile } from "@/lib/cached";

export default function YouPage({ params }: PageProps<"/u/[userId]/you">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <YouScreen params={params} />
    </Suspense>
  );
}

const slotLabel: Record<string, string> = {
  weekday_daytime: "weekday days",
  weekday_evening: "weekday evenings",
  weekend_daytime: "weekend days",
  weekend_evening: "weekend evenings",
};

async function YouScreen({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [profile, data, look] = await Promise.all([
    getProfile(userId),
    getConnections(userId),
    api.look(userId).catch(() => ({})),
  ]);
  if (!profile || !data) notFound();
  const { public: pub, private: priv } = profile;
  const logistics = [
    priv.logistics.area,
    priv.logistics.budget,
    ...priv.logistics.free.map((s) => slotLabel[s] ?? s),
  ].filter((s): s is string => Boolean(s));
  const group = data.group;

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 pb-6 lg:max-w-5xl">
      <Blobs
        blobs={[
          { color: "ochre", x: "86%", y: "6%", size: 240, opacity: 0.55, blur: 55 },
          { color: "periwinkle", x: "2%", y: "62%", size: 220, opacity: 0.35, blur: 60 },
        ]}
      />

      <header className="flex flex-col gap-2.5 px-7 pt-8 pb-6 md:px-10 md:pt-12">
        <Meta>what your agent knows</Meta>
        <Title>{pub.name.toLowerCase()}</Title>
        {pub.vibe && <p className="text-body font-light tracking-body text-ink-muted">{pub.vibe}</p>}
      </header>

      <div className="grid gap-x-16 px-7 md:px-10 lg:grid-cols-2">
        <section>
          {pub.looking_for && (
            <Row label="looking for">
              <p className="text-[17px] leading-[26px] font-light tracking-stat">{pub.looking_for}</p>
            </Row>
          )}
          {pub.interests.length > 0 && (
            <Row label="interests">
              <Chips items={pub.interests} />
            </Row>
          )}

          <Row label="your agent in the world">
            <LookEditor userId={userId} initial={look} />
          </Row>

          {group && (
            // The group itself (members, plans) lives in the group flow; this just points there.
            <Link
              href={`/u/${userId}/group`}
              className="press mt-8 flex items-center justify-between rounded-lg bg-sheet px-5 py-4 shadow-[0_1px_0_var(--color-line)] hover:-translate-y-0.5"
            >
              <span className="flex flex-col gap-1">
                <span className="micro text-ink-muted">( your group · {group.members.length} )</span>
                <span className="text-[15px] leading-6 font-light tracking-label lowercase">
                  {group.members.filter((m) => m.user_id !== userId).map((m) => m.full_name).join(", ")}
                </span>
              </span>
              <span aria-hidden className="text-ink-muted">→</span>
            </Link>
          )}
        </section>

        <section>
          <p className="micro pt-8 pb-1 text-ink-muted lg:pt-4">( only your agent sees these · never shared word for word )</p>
          {priv.values.length > 0 && (
            <Row label="values">
              <Chips items={priv.values} />
            </Row>
          )}
          {priv.dealbreakers.length > 0 && (
            <Row label="dealbreakers">
              <Chips items={priv.dealbreakers} />
            </Row>
          )}
          {priv.energy && (
            <Row label="energy">
              <p className="text-body font-light tracking-body">{priv.energy}</p>
            </Row>
          )}
          {logistics.length > 0 && (
            <Row label="logistics">
              <Chips items={logistics} />
            </Row>
          )}
        </section>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4">
      <span className="micro text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <li
          key={t}
          style={{ animationDelay: `${i * 40}ms` }}
          className="pop-in rounded-full border border-ink/25 px-2.5 py-1 text-label tracking-label lowercase transition-colors hover:border-ink hover:bg-ink hover:text-paper"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}
