import { setOfflineModeEnabled } from "./offline-mode";
import { drainQueue, clearOfflineDataAndQueue } from "./offline-queue";
import { queryClient } from "./queryClient";

export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // ignore — service worker is best-effort.
  }
}

export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    // ignore
  }
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    } catch {
      // ignore
    }
  }
}

export async function enableOfflineMode(): Promise<void> {
  setOfflineModeEnabled(true);
  await registerServiceWorker();
  // Refresh reference data so it lands in IndexedDB right away.
  queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
  queryClient.invalidateQueries({ queryKey: ["/api/routines"] });
}

export async function disableOfflineMode(): Promise<void> {
  // Best-effort: drain any queued items if we currently have a connection.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await drainQueue();
    } catch {
      // ignore
    }
  }
  await clearOfflineDataAndQueue();
  await unregisterServiceWorkers();
  setOfflineModeEnabled(false);
}
