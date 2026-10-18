"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Opens / closes an agent conversation in the connections drawer by setting `?pair=` on the current URL. */
export function useOpenPair() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hrefFor = useCallback(
    (pairId: string | null) => {
      const q = new URLSearchParams(params);
      if (pairId) q.set("pair", pairId);
      else q.delete("pair");
      return q.size ? `${pathname}?${q}` : pathname;
    },
    [params, pathname],
  );
  const open = useCallback((pairId: string) => router.push(hrefFor(pairId), { scroll: false }), [router, hrefFor]);
  const close = useCallback(() => router.replace(hrefFor(null), { scroll: false }), [router, hrefFor]);
  const prefetch = useCallback((pairId: string) => router.prefetch(hrefFor(pairId)), [router, hrefFor]);
  return { open, close, prefetch, current: params.get("pair") };
}
