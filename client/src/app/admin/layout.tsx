import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav, LogoMark } from "@/components/admin-nav";
import { Blobs } from "@/components/atmosphere";

export const metadata: Metadata = { title: "unif.ai admin" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <Blobs
        blobs={[
          { color: "ochre", x: "88%", y: "4%", size: 140, opacity: 0.45, blur: 30 },
          { color: "glacier", x: "26%", y: "96%", size: 130, opacity: 0.4, blur: 30 },
        ]}
      />
      <aside className="flex shrink-0 items-center justify-between gap-4 whitespace-nowrap [overflow-wrap:normal] border-b border-line bg-white/25 px-[18px] py-4 lg:w-[220px] lg:flex-col lg:items-stretch lg:justify-between lg:border-r lg:border-b-0 lg:py-6">
        <div className="flex min-w-0 items-center gap-4 lg:flex-col lg:items-stretch lg:gap-1">
          <Link href="/admin" className="flex items-center gap-2.5 px-2.5 lg:pb-6">
            <LogoMark />
            <span className="fs-15 lh-18 font-light tracking-meta">unif.ai</span>
            <span className="hidden font-mono fs-10 leading-3 tracking-[0.12em] text-ink-muted sm:inline">admin</span>
          </Link>
          <Suspense fallback={null}>
            <AdminNav />
          </Suspense>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-[26px] px-5 py-6 md:px-8 md:py-[30px]">{children}</main>
    </div>
  );
}
