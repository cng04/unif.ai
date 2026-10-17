import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Blobs } from "@/components/atmosphere";
import { Meta, Title } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function YouPage({ params }: PageProps<"/u/[userId]/you">) {
  return (
    <Suspense fallback={null}>
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
  const [profile, data] = await Promise.all([api.profile(userId), api.connections(userId)]).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
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

          {group && (
            <>
              <p className="micro pt-8 pb-1 text-ink-muted">( your group · {group.members.length} )</p>
              <ul className="border-t border-line">
                {group.members.map((m) => (
                  <li key={m.user_id} className="border-b border-line py-2.5 text-label tracking-label lowercase">
                    {m.user_id === userId ? "you" : m.full_name}
                  </li>
                ))}
              </ul>
              {group.events.map((e) => (
                <a
                  key={e.name}
                  href={e.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="press mt-4 flex flex-col gap-1.5 rounded-lg bg-sheet px-5 py-4 shadow-[0_1px_0_var(--color-line)] hover:-translate-y-0.5"
                >
                  <span className="micro text-ink-muted">( found for your group )</span>
                  <span className="text-[19px] leading-7 font-light tracking-label lowercase">{e.name}</span>
                  {(e.venue || e.starts_at) && (
                    <span className="micro">
                      {[e.starts_at && formatDate(e.starts_at), e.venue?.toLowerCase()].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </a>
              ))}
            </>
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

function formatDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toLowerCase();
}
