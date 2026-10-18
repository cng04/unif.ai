import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";

// Desktop gets the tabs in a sticky top bar; on mobile they sit at the bottom of the tab pages instead.
// The bar is h-[88px]: pages with their own sticky header pin it at md:top-[88px], just below.
export default function UserLayout({ children }: LayoutProps<"/u/[userId]">) {
  return (
    <>
      <div className="sticky top-0 z-30 hidden bg-paper/70 backdrop-blur-md md:block">
        <header className="mx-auto flex h-[88px] w-full max-w-6xl items-center justify-between px-10">
          <span className="fs-15 tracking-[0.12em]">unif.ai</span>
          <div className="w-[440px]">
            <Suspense fallback={<div className="h-11 rounded-full bg-ink" />}>
              <TabBar />
            </Suspense>
          </div>
        </header>
      </div>
      {children}
    </>
  );
}
