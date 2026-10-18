"use client";

import { useActionState, useEffect, useState } from "react";
import type { JoinState } from "@/app/join/[code]/actions";
import type { Invite } from "@/lib/api";
import { Glass } from "./ui";

const input =
  "w-full rounded-full border border-line bg-white/60 px-[18px] py-3 text-[15px] font-light tracking-body outline-none transition-colors placeholder:text-ink-faint focus:border-ink/40";
// Without ASI_AGENT_URL on the server there's no direct link to the agent, so open ASI:One and name the handle.
const ASI_ONE_HOME = "https://asi1.ai";

const primary =
  "press flex w-full items-center justify-center rounded-full bg-ink py-3.5 text-[12px] tracking-meta text-paper disabled:opacity-50";

export function JoinFlow({
  invite,
  action,
}: {
  invite: Invite;
  action: (prev: JoinState, form: FormData) => Promise<JoinState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const result = state.result;

  if (result?.status === "joined") return <Joined first={result.first_name!} phone={result.phone!} line={result.line!} sms={result.sms!} />;
  if (result?.status === "pending")
    return (
      <Done title={`you're in, ${result.first_name!.toLowerCase()}!`}>
        We couldn&apos;t set up your iMessage chat just now. We&apos;ll text you at {result.phone} soon. If you&apos;re not
        on iMessage, reply to whoever sent this invite and we&apos;ll sort it out.
      </Done>
    );

  // Seats ran out (now or when they submitted): ASI:One becomes the way in.
  const full = result?.status === "imessage_full";
  if (!invite.imessage || full) {
    return (
      <>
        {full && <p className="rise-in micro text-ember-text">{result.message}</p>}
        <AsiCard invite={invite} primary />
      </>
    );
  }

  return (
    <>
      <Glass className="rise-in flex flex-col gap-4 p-5" >
        <p className="meta text-ink/70">( join over imessage )</p>
        <form action={formAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="micro text-ink-muted">your name</span>
            <input name="name" required maxLength={120} autoComplete="name" defaultValue={state.name} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="micro text-ink-muted">phone number</span>
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="+1 555 123 4567"
              defaultValue={state.phone}
              className={input}
            />
          </label>
          {(result?.status === "invalid" || state.error) && (
            <p className="micro text-ember-text">{result?.message ?? state.error}</p>
          )}
          <button disabled={pending} className={primary}>
            {pending ? "joining…" : "join"}
          </button>
        </form>
      </Glass>
      <AsiCard invite={invite} />
    </>
  );
}

function AsiCard({ invite, primary: isPrimary = false }: { invite: Invite; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(invite.asi_command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <section
      className={`rise-in flex flex-col gap-4 ${isPrimary ? "rounded-md border border-line bg-surface p-5 backdrop-blur-[20px]" : "px-1"}`}
      style={{ animationDelay: "120ms" }}
    >
      <p className="meta text-ink/70">( {isPrimary ? "join on asi:one" : "or join on asi:one"} )</p>
      <ol className="flex flex-col gap-3 text-[13px] leading-[19px] font-light tracking-body">
        <li className="flex flex-col gap-2">
          <span>
            <span className="micro mr-2 text-ink-muted">01</span>copy your join code
          </span>
          <button
            type="button"
            onClick={copy}
            className="press flex items-center justify-between rounded-full border border-dashed border-ink/40 px-4 py-2.5 font-mono text-[12px] tracking-[0.08em] hover:bg-white/40"
          >
            {invite.asi_command}
            <span className="micro text-ink-muted">{copied ? "copied ✓" : "copy"}</span>
          </button>
        </li>
        <li>
          <span className="micro mr-2 text-ink-muted">02</span>
          {invite.asi_url ? "open the agent and paste it as your first message" : <>find <strong className="font-normal">{invite.asi_handle}</strong> on ASI:One and paste it as your first message</>}
        </li>
      </ol>
      <a
        href={invite.asi_url ?? ASI_ONE_HOME}
        target="_blank"
        rel="noopener noreferrer"
        // ASI:One links can't pre-fill a message, so copy the code on the way out.
        onClick={() => navigator.clipboard?.writeText(invite.asi_command)}
        className={isPrimary ? primary : "press flex w-full items-center justify-center rounded-full border border-ink/25 py-3 text-[12px] tracking-meta hover:bg-white/40"}
      >
        {invite.asi_url ? <>copy code &amp; chat with {invite.asi_handle}</> : "copy code & open ASI:One"}
      </a>
      <p className="micro text-ink-muted">forgot it? the agent will ask which group you&apos;re joining.</p>
    </section>
  );
}

function Joined({ first, phone, line, sms }: { first: string; phone: string; line: string; sms: string }) {
  // Hand straight off to Messages, like the old page did; the button stays as a fallback.
  useEffect(() => {
    window.location.href = sms;
  }, [sms]);
  return (
    <Done title={`you're in, ${first.toLowerCase()}!`}>
      Text <strong className="font-normal text-ink">{line}</strong> from <strong className="font-normal text-ink">{phone}</strong>{" "}
      to start chatting with your agent.
      <a href={sms} className={`${primary} mt-5`}>
        text us to start
      </a>
      <span className="micro mt-3 block">the chat runs over imessage. reply stop anytime to opt out.</span>
    </Done>
  );
}

function Done({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Glass className="rise-in flex flex-col gap-3 p-6">
      <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper">✓</span>
      <h2 className="text-title font-light tracking-label">{title}</h2>
      <div className="text-body font-light tracking-body text-ink-muted">{children}</div>
    </Glass>
  );
}
