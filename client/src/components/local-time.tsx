"use client";

/** "thu 21:04" in the viewer's own timezone. */
export function LocalTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {day} {time}
    </time>
  );
}
