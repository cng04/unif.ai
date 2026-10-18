import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Blobs } from "@/components/atmosphere";
import { Meta, Title } from "@/components/ui";
import { api, ApiError, type Group, type Plan } from "@/lib/api";

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
              <Plans group={group} />
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

/** The 3 plans the event search found for the group: a top-pick card, then compact rows. */
function Plans({ group }: { group: Group }) {
  if (group.plans_status === "pending") {
    return <p className="micro pt-8 text-ink-muted">( your event agent is finding plans… )</p>;
  }
  const [top, ...rest] = group.events;
  if (!top) return null;
  return (
    <section className="pt-8">
      <p className="micro text-ink-muted">( your event agent found {group.events.length} plan{group.events.length === 1 ? "" : "s"} )</p>
      {group.plans_summary && (
        <p className="pt-1.5 text-body font-light tracking-body text-ink-muted">{group.plans_summary}</p>
      )}
      <a
        href={top.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="press mt-4 flex flex-col gap-2.5 rounded-lg bg-sheet px-5 py-5 shadow-[0_1px_0_var(--color-line)] hover:-translate-y-0.5"
      >
        <span className="micro flex justify-between text-ink-muted">
          <span>01 · top pick</span>
          <span>via {top.source.toLowerCase()}</span>
        </span>
        <span className="text-[21px] leading-8 font-light tracking-label lowercase">{top.name}</span>
        <PlanMeta plan={top} />
        {top.reason && <span className="text-body font-light tracking-body text-ink-muted">{top.reason}</span>}
      </a>
      {rest.map((p, i) => (
        <a
          key={`${p.name}-${i}`}
          href={p.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="press mt-2.5 flex items-center gap-4 rounded-lg border border-line bg-surface px-5 py-4 hover:-translate-y-0.5"
        >
          <span className="micro text-ink-muted">{String(i + 2).padStart(2, "0")}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[15px] leading-6 font-light tracking-label lowercase">{p.name}</span>
            <PlanMeta plan={p} />
          </span>
          <span aria-hidden className="text-ink-muted">›</span>
        </a>
      ))}
    </section>
  );
}

function PlanMeta({ plan }: { plan: Plan }) {
  const when = plan.time_label ?? (plan.starts_at && formatDate(plan.starts_at));
  const parts = [when, plan.venue?.toLowerCase(), plan.price].filter(Boolean);
  return parts.length > 0 ? <span className="micro">{parts.join(" · ")}</span> : null;
}

function formatDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toLowerCase();
}
