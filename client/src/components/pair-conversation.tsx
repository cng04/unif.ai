import { LocalTime } from "@/components/local-time";
import { Bubble, formatScore, Meta, SpeakerLabel, Title } from "@/components/ui";
import type { PairDetail } from "@/lib/api";
import type { ReactNode } from "react";

/** One agent-to-agent conversation (frame 8b). Shared by the pair page and the connections drawer. */
export function PairConversation({ pair, userId }: { pair: PairDetail; userId: string }) {
  const name = pair.other.full_name.toLowerCase();
  const first = pair.messages.at(0);
  const last = pair.messages.at(-1);
  const minutes =
    first && last ? Math.max(1, Math.round((Date.parse(last.created_at) - Date.parse(first.created_at)) / 60000)) : null;

  return (
    <>
      <header className="relative flex flex-col gap-3.5 border-b border-line px-7 pt-5 pb-[18px]">
        <div className="flex items-center gap-2.5">
          <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden className="shrink-0">
            <line x1="7" y1="7" x2="37" y2="7" stroke="var(--color-ink)" strokeWidth="1.1" strokeOpacity="0.6" />
            <circle cx="7" cy="7" r="5" fill="var(--color-ink)" />
            <circle cx="37" cy="7" r="5" fill="var(--color-ink)" />
          </svg>
          <Meta className="text-ink-muted">your agent × {name}&apos;s agent</Meta>
        </div>
        <Title>{headline(pair)}</Title>
        <dl className="flex items-baseline gap-[22px]">
          <HeaderStat value={formatScore(pair.vibe_score)} label="match" big />
          {pair.logistics_fit && <HeaderStat value={pair.logistics_fit} label="logistics" />}
          {minutes != null && <HeaderStat value={`${minutes} min`} label={<LocalTime iso={first!.created_at} />} />}
        </dl>
      </header>

      <section className="relative flex flex-col gap-3.5 px-5 pt-5 pb-[max(30px,env(safe-area-inset-bottom))]">
        {pair.looking_for && (
          <div className="flex flex-col gap-2.5 px-2 pt-1 pb-2.5">
            <p className="micro text-ink-muted">( what {name}&apos;s looking for )</p>
            <p className="text-[17px] leading-[26px] font-light tracking-stat">{pair.looking_for}</p>
          </div>
        )}

        {pair.messages.length === 0 && (
          <p className="micro py-6 text-center text-ink-muted">( no conversation recorded )</p>
        )}
        {pair.messages.map((m, i) => {
          const side = m.speaker_id === userId ? "you" : "them";
          // Name the speaker whenever the turn changes, not only the first time.
          const newTurn = pair.messages[i - 1]?.speaker_id !== m.speaker_id;
          return (
            // Replays the conversation: each message rises in after the one before it.
            <div
              key={i}
              style={{ animationDelay: `${250 + i * 160}ms` }}
              className={`rise-in flex max-w-[82%] flex-col gap-[5px] ${side === "you" ? "ml-[18%] items-end self-end" : "mr-[18%] items-start self-start"} ${newTurn && i > 0 ? "mt-2" : ""}`}
            >
              {newTurn && <SpeakerLabel side={side}>{side === "you" ? "your agent" : `${name}'s agent`}</SpeakerLabel>}
              <Bubble side={side}>{m.content}</Bubble>
            </div>
          );
        })}

        {pair.messages.length > 0 && (
          <div className="fade-in flex items-center gap-2.5 pt-2.5 pb-1" style={{ animationDelay: `${250 + pair.messages.length * 160}ms` }}>
            <span className="h-px flex-1 bg-line" />
            <span className="micro text-ink-muted">( {outcome(pair)} )</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        )}
      </section>
    </>
  );
}

function HeaderStat({ value, label, big }: { value: ReactNode; label: ReactNode; big?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dd className={big ? "text-stat leading-6 font-light tracking-stat" : "font-mono text-label tracking-[0.08em]"}>
        {value}
      </dd>
      <dt className="micro text-ink-muted">{label}</dt>
    </div>
  );
}

/** Built from the keywords both people score high on; no generated headline exists yet. */
function headline({ shared_keywords: kw }: PairDetail) {
  if (kw.length === 0) return "how your agents met";
  const list = kw.length === 1 ? kw[0] : `${kw.slice(0, -1).join(", ")} and ${kw.at(-1)}`;
  return `you're both into ${list}`;
}

function outcome(pair: PairDetail) {
  if (pair.conflict) return "not a fit";
  const strength = (pair.vibe_score ?? 0) >= 7 ? "strong match" : "match";
  return pair.in_group ? `${strength} · in your group` : strength;
}
