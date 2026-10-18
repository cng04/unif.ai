"use client";

import { useState } from "react";

export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="press rounded-full border border-ink/25 px-3 py-1.5 text-label leading-3 tracking-meta hover:bg-ink/5"
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}
