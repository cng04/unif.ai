"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/admin/actions";
import { titleClass } from "@/components/admin-ui";

export function RenameUniverseTitle({
  name,
  action,
}: {
  name: string;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await action(prev, form);
    if (!result.error) setEditing(false);
    return result;
  }, {});

  if (!editing) {
    return (
      <div className="group flex items-baseline gap-3">
        <h1 className={titleClass}>{name}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="micro text-ink-muted opacity-60 transition-opacity group-hover:opacity-100 hover:text-ink"
        >
          rename
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          autoFocus
          maxLength={120}
          defaultValue={name}
          aria-label="universe name"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className={`${titleClass} min-w-0 rounded-[12px] border border-line bg-white/55 px-3 py-0.5 outline-none focus:border-ink/40`}
        />
        <button
          disabled={pending}
          className="press rounded-full bg-ink px-3.5 py-[7px] text-label leading-3 tracking-meta text-paper disabled:opacity-50"
        >
          {pending ? "saving…" : "save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="micro text-ink-muted hover:text-ink"
        >
          cancel
        </button>
      </div>
      {state.error && <p className="micro text-ember-text">{state.error}</p>}
    </form>
  );
}

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
          className="min-w-0 flex-1 rounded-full border border-line bg-white/55 px-4 py-2.5 fs-13 font-light tracking-body outline-none placeholder:text-ink-faint focus:border-ink/40"
        />
        <input
          name="admin_email"
          type="email"
          required
          placeholder="admin email"
          className="min-w-0 flex-1 rounded-full border border-line bg-white/55 px-4 py-2.5 fs-13 font-light tracking-body outline-none placeholder:text-ink-faint focus:border-ink/40"
        />
        <button
          disabled={pending}
          className="press rounded-full bg-ink px-5 py-2.5 fs-11.5 tracking-meta text-paper disabled:opacity-50"
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
  pendingLabel = "starting…",
  confirm,
  danger,
  disabled,
}: {
  action: (prev: ActionState) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  /** Asked in a browser confirm dialog before submitting. */
  confirm?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-col gap-1.5"
    >
      <button
        disabled={pending || disabled}
        className={`press self-start rounded-full px-3.5 py-[7px] text-label leading-3 tracking-meta disabled:opacity-40 ${
          danger ? "border border-ember bg-ember/10 text-ember-text hover:bg-ember/20" : "bg-ink text-paper"
        }`}
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error && <p className="micro max-w-[220px] text-ember-text">{state.error}</p>}
    </form>
  );
}

/** Universe name in the page header, with an inline "rename" that saves on enter or the save button. */
export function RenameUniverse({
  name,
  action,
}: {
  name: string;
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const next = await action(prev, form);
    if (!next.error) setEditing(false);
    return next;
  }, {});

  if (!editing) {
    return (
      <span className="group inline-flex items-baseline gap-3">
        {name}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="press font-mono fs-10 tracking-label text-ink-muted opacity-60 transition-opacity group-hover:opacity-100 hover:text-ink"
        >
          rename
        </button>
      </span>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="name"
        defaultValue={name}
        required
        maxLength={120}
        autoFocus
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className="min-w-0 rounded-full border border-line bg-white/60 px-4 py-1.5 fs-22 leading-8 font-light tracking-[0.08em] lowercase outline-none focus:border-ink/40"
      />
      <button disabled={pending} className="press rounded-full bg-ink px-4 py-2 fs-11.5 tracking-meta text-paper disabled:opacity-50">
        {pending ? "saving…" : "save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="press px-2 py-2 fs-11.5 tracking-meta text-ink-muted hover:text-ink">
        cancel
      </button>
      {state.error && <p className="micro w-full text-ember-text">{state.error}</p>}
    </form>
  );
}
