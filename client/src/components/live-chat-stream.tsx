"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Caption, Panel } from "@/components/admin-ui";

type ChatEvent = {
  id: number;
  pair_id: string;
  pair_status: "running" | "complete";
  speaker_id: string;
  speaker_name: string;
  content: string;
  created_at: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
};

type PairFeed = {
  id: string;
  a: ChatEvent["a"];
  b: ChatEvent["b"];
  firstEvent: number;
  messages: ChatEvent[];
};

export function LiveChatStream({ universeId }: { universeId: string }) {
  const router = useRouter();
  const [pairs, setPairs] = useState<Record<string, PairFeed>>({});
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");

  useEffect(() => {
    const source = new EventSource(`/admin/api/universes/${universeId}/chats/stream`);

    const onMessage = (raw: MessageEvent<string>) => {
      const message = JSON.parse(raw.data) as ChatEvent;
      setConnection("live");
      setPairs((current) => {
        const pair = current[message.pair_id];
        if (pair?.messages.some((item) => item.id === message.id)) return current;
        return {
          ...current,
          [message.pair_id]: {
            id: message.pair_id,
            a: message.a,
            b: message.b,
            firstEvent: pair?.firstEvent ?? message.id,
            messages: [...(pair?.messages ?? []), message],
          },
        };
      });
    };
    const onDone = () => {
      source.close();
      router.refresh();
    };

    source.addEventListener("open", () => setConnection("live"));
    source.addEventListener("message", onMessage as EventListener);
    source.addEventListener("done", onDone);
    source.onerror = () => setConnection("reconnecting");
    return () => source.close();
  }, [router, universeId]);

  const feeds = useMemo(() => Object.values(pairs).sort((a, b) => a.firstEvent - b.firstEvent), [pairs]);
  const messageCount = feeds.reduce((total, pair) => total + pair.messages.length, 0);

  return (
    <Panel className="flex flex-col gap-4 p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Caption>
          live agent chats · {feeds.length} conversations · {messageCount} turns
        </Caption>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-label text-ink-muted">
          <span className={`size-2 rounded-full ${connection === "live" ? "animate-pulse bg-blob-ochre" : "bg-ink-faint"}`} />
          {connection}
        </span>
      </div>

      {feeds.length === 0 ? (
        <p className="py-5 text-center font-sans text-[13px] text-ink-muted">
          waiting for the first agent turn…
        </p>
      ) : (
        <div className="grid max-h-[560px] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {feeds.map((pair) => (
            <article key={pair.id} className="flex min-h-[180px] flex-col gap-3 rounded-2xl border border-line bg-paper/70 p-3.5">
              <header className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                <h2 className="truncate font-sans text-[13px] text-ink">
                  {pair.a.name} × {pair.b.name}
                </h2>
                <span className="shrink-0 font-mono text-[9px] tracking-meta text-ink-faint">
                  {pair.messages.length} turns
                </span>
              </header>
              <div className="flex flex-1 flex-col gap-2" aria-live="polite">
                {pair.messages.map((message) => {
                  const first = message.speaker_id === pair.a.id;
                  return (
                    <div key={message.id} className={`flex max-w-[92%] flex-col gap-0.5 ${first ? "items-start" : "items-end self-end"}`}>
                      <span className="font-mono text-[8.5px] tracking-label text-ink-faint">
                        {message.speaker_name.toLowerCase()}
                      </span>
                      <p
                        className={`rounded-2xl px-3 py-2 font-sans text-[12px] leading-[17px] text-ink ${
                          first ? "rounded-bl-sm bg-[#E2B36C3D]" : "rounded-br-sm bg-[#A8D6E066]"
                        }`}
                      >
                        {message.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
