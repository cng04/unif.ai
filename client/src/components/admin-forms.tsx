"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/admin/actions";

export function CreateUniverseForm({ action }: { action: (prev: ActionState, form: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          name="name"
          required
          maxLength={120}
          placeholder="universe name, e.g. la hacks"
          className="min-w-0 flex-1 rounded-full border border-line bg-white/55 px-4 py-2.5 text-[13px] font-light tracking-body outline-none placeholder:text-ink-faint focus:border-ink/40"
        />
        <input
          name="admin_email"
          type="email"
          required
          placeholder="admin email"
          className="min-w-0 flex-1 rounded-full border border-line bg-white/55 px-4 py-2.5 text-[13px] font-light tracking-body outline-none placeholder:text-ink-faint focus:border-ink/40"
        />
        <button
          disabled={pending}
          className="press rounded-full bg-ink px-5 py-2.5 text-[11.5px] tracking-meta text-paper disabled:opacity-50"
        >
          {pending ? "creating…" : "create universe"}
        </button>
      </div>
      {state.error && <p className="micro text-ember-text">{state.error}</p>}
    </form>
  );
}

export function RunMatchingButton({
  action,
  label,
  disabled,
}: {
  action: (prev: ActionState) => Promise<ActionState>;
  label: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <button
        disabled={pending || disabled}
        className="press self-start rounded-full bg-ink px-3.5 py-[7px] text-label leading-3 tracking-meta text-paper disabled:opacity-40"
      >
        {pending ? "starting…" : label}
      </button>
      {state.error && <p className="micro max-w-[220px] text-ember-text">{state.error}</p>}
    </form>
  );
}
