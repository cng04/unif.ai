import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";

export default function TabsLayout({ children }: LayoutProps<"/u/[userId]">) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <div className="sticky bottom-0 z-10 px-5 pt-2 pb-[max(30px,env(safe-area-inset-bottom))] md:hidden">
        {/* TabBar reads the URL, so it renders at request time; the empty bar holds its place in the shell. */}
        <Suspense fallback={<div className="h-11 rounded-full bg-ink" />}>
          <TabBar />
        </Suspense>
      </div>
    </div>
  );
}
