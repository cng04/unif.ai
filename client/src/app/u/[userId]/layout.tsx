import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";

// Desktop gets the tabs in a top bar; on mobile they sit at the bottom of the tab pages instead.
export default function UserLayout({ children }: LayoutProps<"/u/[userId]">) {
  return (
    <>
      <header className="mx-auto hidden w-full max-w-6xl items-center justify-between px-10 pt-7 md:flex">
        <span className="text-[15px] tracking-[0.12em]">unif.ai</span>
        <div className="w-[360px]">
          <Suspense fallback={<div className="h-11 rounded-full bg-ink" />}>
            <TabBar />
          </Suspense>
        </div>
      </header>
      {children}
    </>
  );
}
