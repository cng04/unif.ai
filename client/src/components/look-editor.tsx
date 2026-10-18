"use client";

import { useState, useTransition } from "react";
import { AgentAvatar } from "@/components/visualizer/agent-avatar";
import { HAIRS, HAIR_STYLES, PANTS, SKINS, type Look } from "@/components/visualizer/character";
import { resetLook, saveLook } from "@/app/u/[userId]/(tabs)/you/actions";

const STYLE_NAMES = ["short", "long", "bun", "spiky", "buzz"];
const SHIRT_HUES = [0, 30, 55, 120, 175, 220, 275, 330];

type Part = "skin" | "hair" | "hair_style" | "shirt_hue" | "pants";

/** Lets someone change how their agent looks in the world. Unset parts show the sprite's default. */
export function LookEditor({ userId, initial }: { userId: string; initial: Look }) {
  const [look, setLook] = useState<Look>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function choose(part: Part, value: number) {
    const next = { ...look, [part]: value, source: "you" as const };
    setLook(next);
    setError(undefined);
    start(async () => {
      const res = await saveLook(userId, next);
      if (res.error) setError(res.error);
    });
  }

  function reset() {
    setError(undefined);
    start(async () => {
      const res = await resetLook(userId);
      if (res.error) setError(res.error);
      else setLook(res.look ?? {});
    });
  }

  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="flex items-center gap-4">
        <AgentAvatar userId={userId} look={look} selected={false} />
        <p className="fs-13 leading-5 font-light text-ink-muted">
          {look.source === "agent"
            ? "your agent picked this from what you told it. change anything that's off."
            : look.source === "you"
              ? "you set this. everyone in your group's world sees it."
              : "nothing you said described how you look, so this is a placeholder. pick what fits."}
        </p>
      </div>
      <Swatches label="skin" colors={SKINS} value={look.skin} onPick={(i) => choose("skin", i)} />
      <Swatches label="hair" colors={HAIRS} value={look.hair} onPick={(i) => choose("hair", i)} />
      <Options
        label="hair style"
        options={STYLE_NAMES.slice(0, HAIR_STYLES)}
        value={look.hair_style}
        onPick={(i) => choose("hair_style", i)}
      />
      <Swatches
        label="shirt"
        colors={SHIRT_HUES.map((h) => `hsl(${h} 62% 52%)`)}
        value={look.shirt_hue == null ? null : SHIRT_HUES.indexOf(look.shirt_hue)}
        onPick={(i) => choose("shirt_hue", SHIRT_HUES[i])}
      />
      <Swatches label="pants" colors={PANTS} value={look.pants} onPick={(i) => choose("pants", i)} />
      <div className="flex items-center gap-4">
        <button type="button" onClick={reset} disabled={pending} className="micro press text-ink-muted underline underline-offset-2">
          reset to my agent&apos;s pick
        </button>
        {pending && <span className="micro text-ink-faint">( saving )</span>}
        {error && <span className="micro text-ink-muted">{error}</span>}
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value?: number | null; onPick: (i: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="micro text-ink-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        {colors.map((c, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${label} ${i + 1}`}
            aria-pressed={value === i}
            onClick={() => onPick(i)}
            className={`size-7 rounded-full border border-line ${value === i ? "ring-2 ring-ink ring-offset-2" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

function Options({ label, options, value, onPick }: { label: string; options: string[]; value?: number | null; onPick: (i: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="micro text-ink-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === i}
            onClick={() => onPick(i)}
            className={`rounded-full border px-3 py-1 fs-12 leading-4 tracking-label ${value === i ? "border-ink bg-ink text-paper" : "border-line text-ink-muted"}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
