import Link from "next/link";
import { Meta, Title } from "@/components/ui";

/** Shown on the group screens before matching has placed someone. */
export function NoGroupYet({ userId }: { userId: string }) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-6 pt-10">
      <Meta>your group</Meta>
      <Title>no group yet</Title>
      <p className="text-body font-light tracking-body text-ink-muted">
        Your agent is still meeting people. You&apos;ll get a message as soon as it finds a group you&apos;ll actually enjoy.
      </p>
      <Link href={`/u/${userId}/connections`} className="press self-start rounded-full border border-ink/25 px-4 py-2.5 fs-11.5 tracking-meta">
        ← your connections
      </Link>
    </main>
  );
}
