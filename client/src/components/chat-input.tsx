"use client";

import { useActionState, useRef } from "react";

type State = { error?: string };

export function ChatInput({
  action,
  placeholder,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  placeholder: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: State, form: FormData) => {
    const next = await action(prev, form);
    if (!next.error) formRef.current?.reset();
    return next;
  }, {});

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      {state.error && <p className="micro px-4 text-ember-text">{state.error}</p>}
      <div className="flex items-center gap-2.5 rounded-full border border-line bg-white/55 py-1.5 pr-1.5 pl-[18px]">
        <input
          name="message"
          placeholder={pending ? "your agent is thinking…" : placeholder}
          disabled={pending}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[13px] leading-4 font-light tracking-body outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Send"
          className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-ink disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="var(--color-paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
