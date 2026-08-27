import { useEffect, useState } from "react";
import { getCacheServed, subscribeCacheServed } from "@/lib/read-fallback";

/** True while reads are being served from the offline mirror because the
 * network is slow or unreachable; clears as soon as a read succeeds again. */
export function useCacheServed(): boolean {
  const [served, setServed] = useState<boolean>(() => getCacheServed());
  useEffect(() => {
    const cb = () => setServed(getCacheServed());
    cb();
    return subscribeCacheServed(cb);
  }, []);
  return served;
}
