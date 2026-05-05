import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  LogOut,
  Loader2,
  Mail,
  User as UserIcon,
  Clock,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import { cacheGet } from "@/lib/offline-db";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import {
  useQueueCount,
  useFailedCount,
  drainQueue,
  getFailedItems,
  discardFailedItem,
  discardAllFailedItems,
  subscribeQueueChange,
} from "@/lib/offline-queue";
import type { FailedItem } from "@/lib/offline-db";
import { enableOfflineMode, disableOfflineMode } from "@/lib/offline-control";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function SettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);
  const [timeFormat, setTimeFormat] = useTimeFormat();
  const [offlineModeEnabled, setOfflineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const pendingCount = useQueueCount();
  const failedCount = useFailedCount();
  const [busyToggle, setBusyToggle] = useState(false);
  const [draining, setDraining] = useState(false);
  const [showFailedDialog, setShowFailedDialog] = useState(false);
  const [failedItems, setFailedItems] = useState<FailedItem[] | null>(null);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [estimateBytes, setEstimateBytes] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    sw: boolean;
    accountReady: boolean;
    skillsCount: number | null;
    drillsCount: number | null;
    connectionsCount: number | null;
    routinesCount: number | null;
  } | null>(null);

  useEffect(() => {
    if (!offlineModeEnabled) {
      setDownloadStatus(null);
      return;
    }
    let alive = true;
    const check = async () => {
      let sw = false;
      try {
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          sw = !!(reg && (reg.active || reg.installing || reg.waiting));
        }
      } catch {
        // ignore
      }
      let accountReady = false;
      let skillsCount: number | null = null;
      let drillsCount: number | null = null;
      let connectionsCount: number | null = null;
      let routinesCount: number | null = null;
      try {
        const cachedUser = await cacheGet<{ id?: string }>("user");
        accountReady = !!(cachedUser && typeof cachedUser === "object");
      } catch {
        // ignore
      }
      try {
        const skills = await cacheGet<Array<{ isDrill?: number }>>("skills");
        if (Array.isArray(skills)) {
          skillsCount = skills.filter((s) => (s.isDrill ?? 0) === 0).length;
          drillsCount = skills.filter((s) => s.isDrill === 1).length;
          connectionsCount = skills.filter((s) => s.isDrill === 2).length;
        }
      } catch {
        // ignore
      }
      try {
        const routines = await cacheGet<unknown[]>("routines");
        routinesCount = Array.isArray(routines) ? routines.length : null;
      } catch {
        // ignore
      }
      if (alive)
        setDownloadStatus({
          sw,
          accountReady,
          skillsCount,
          drillsCount,
          connectionsCount,
          routinesCount,
        });
    };
    void check();
    const interval = setInterval(check, 3000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [offlineModeEnabled, isOnline]);

  useEffect(() => {
    if (!offlineModeEnabled) {
      setStorageBytes(null);
      return;
    }
    let alive = true;
    const refresh = async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
          if (alive) setStorageBytes(null);
          return;
        }
        const est = await navigator.storage.estimate();
        if (alive) setStorageBytes(typeof est.usage === "number" ? est.usage : null);
      } catch {
        if (alive) setStorageBytes(null);
      }
    };
    void refresh();
    const unsub = subscribeQueueChange(() => { void refresh(); });
    return () => {
      alive = false;
      unsub();
    };
  }, [offlineModeEnabled, pendingCount, failedCount]);

  // When offline mode is OFF, predict how much storage enabling it would use:
  // measures the API payloads that get mirrored into IndexedDB plus the static
  // app-shell files the service worker would precache.
  useEffect(() => {
    if (offlineModeEnabled) {
      setEstimateBytes(null);
      return;
    }
    let alive = true;
    const measure = async () => {
      try {
        let total = 0;
        const apiPaths = ["/api/skills", "/api/routines", "/api/auth/me"];
        const shellPaths = [
          "/",
          "/manifest.webmanifest",
          "/favicon.png",
          "/icon-192.png",
          "/icon-512.png",
          "/apple-touch-icon.png",
        ];
        await Promise.all(
          [...apiPaths, ...shellPaths].map(async (url) => {
            try {
              const res = await fetch(url, { credentials: "include" });
              if (!res.ok) return;
              const buf = await res.arrayBuffer();
              total += buf.byteLength;
            } catch {
              // Ignore individual failures; we still surface what we measured.
            }
          }),
        );
        if (alive) setEstimateBytes(total > 0 ? total : null);
      } catch {
        if (alive) setEstimateBytes(null);
      }
    };
    void measure();
    return () => {
      alive = false;
    };
  }, [offlineModeEnabled]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  useEffect(() => {
    if (!showFailedDialog) return;
    let alive = true;
    const refresh = () => {
      getFailedItems().then((items) => {
        if (alive) setFailedItems(items);
      });
    };
    refresh();
    const unsub = subscribeQueueChange(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, [showFailedDialog]);

  useEffect(() => {
    if (showFailedDialog && failedCount === 0) {
      setShowFailedDialog(false);
    }
  }, [showFailedDialog, failedCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const displayName =
    user?.displayName ??
    (user?.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "My Account");

  const handleToggleOffline = async (next: boolean) => {
    if (busyToggle) return;
    setBusyToggle(true);
    try {
      if (next) {
        await enableOfflineMode();
        toast({ title: "Offline mode is on" });
      } else {
        await disableOfflineMode();
        toast({ title: "Offline mode is off" });
      }
    } catch {
      toast({ title: "Failed to update offline mode", variant: "destructive" });
    } finally {
      setBusyToggle(false);
    }
  };

  const handleSyncNow = async () => {
    if (draining || !isOnline) return;
    setDraining(true);
    try {
      const { synced, rejected } = await drainQueue();
      if (synced > 0) {
        toast({ title: `Synced ${synced} offline ${synced === 1 ? "entry" : "entries"}.` });
      } else if (rejected === 0) {
        toast({ title: "Nothing to sync." });
      }
      if (rejected > 0) {
        toast({
          title: `${rejected} ${rejected === 1 ? "entry was" : "entries were"} rejected by the server.`,
          description: "Open the rejected list below to review or discard them.",
          variant: "destructive",
        });
      }
    } finally {
      setDraining(false);
    }
  };

  const handleDiscardOne = async (id: number | undefined) => {
    if (id == null) return;
    await discardFailedItem(id);
    toast({ title: "Rejected entry discarded." });
  };

  const handleDiscardAll = async () => {
    await discardAllFailedItems();
    setConfirmDiscardAll(false);
    setShowFailedDialog(false);
    toast({ title: "All rejected entries discarded." });
  };

  const handleSignOutClick = () => setShowSignOutAlert(true);

  const signOutDescription =
    pendingCount > 0
      ? `You have ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} waiting to sync — signing out will lose ${pendingCount === 1 ? "it" : "them"}.`
      : "Are you sure you want to sign out of your account?";

  const formatBody = (body: unknown): string => {
    try {
      return JSON.stringify(body, null, 2);
    } catch {
      return String(body);
    }
  };

  const kindLabel = (kind: FailedItem["kind"]) =>
    kind === "note" ? "Training note" : "Score";

  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/40 rounded-2xl shrink-0 icon-3d">
          <SettingsIcon className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your account.</p>
        </div>
      </div>

      <main className="space-y-6">
        <section className="rounded-2xl card-3d p-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Account</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-secondary/50">
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Name</p>
                <p className="text-sm font-medium truncate" data-testid="text-settings-name">{displayName}</p>
              </div>
            </div>
            {user?.email && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-secondary/50">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</p>
                  <p className="text-sm font-medium truncate" data-testid="text-settings-email">{user.email}</p>
                </div>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-9 rounded-lg text-sm text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 mt-2 w-fit"
              onClick={handleSignOutClick}
              disabled={isLoggingOut}
              data-testid="btn-sign-out"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Sign out
            </Button>
          </div>
        </section>

        <section id="offline" className="rounded-2xl card-3d p-5 scroll-mt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Offline</h2>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-secondary/50 mt-0.5">
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Offline mode</p>
                <Switch
                  checked={offlineModeEnabled}
                  onCheckedChange={handleToggleOffline}
                  disabled={busyToggle}
                  data-testid="toggle-offline-mode"
                />
              </div>
              {!offlineModeEnabled && (
                <>
                  <p
                    className="text-xs text-muted-foreground mt-1"
                    data-testid="text-offline-hint"
                  >
                    Log sessions and scores with no internet connection — turn it on to get started.
                  </p>
                  {estimateBytes !== null && (
                    <p
                      className="text-[11px] text-muted-foreground mt-1"
                      data-testid="text-storage-estimate"
                    >
                      Estimated storage usage: ~{formatBytes(estimateBytes)}
                    </p>
                  )}
                </>
              )}
              {offlineModeEnabled && (
                <p className="text-xs text-muted-foreground mt-1">
                  Avoid using multiple devices while offline mode is on to prevent mix-ups. Anything you create offline will sync when you reconnect.
                  {storageBytes !== null && (
                    <span data-testid="text-storage-usage"> Storage usage: {formatBytes(storageBytes)}.</span>
                  )}
                </p>
              )}
              {offlineModeEnabled && downloadStatus && (() => {
                const { sw, accountReady, skillsCount, drillsCount, connectionsCount, routinesCount } = downloadStatus;
                const skillsLoaded = skillsCount !== null;
                const drillsLoaded = drillsCount !== null;
                const connectionsLoaded = connectionsCount !== null;
                const routinesReady = routinesCount !== null;
                const allReady =
                  sw && accountReady && skillsLoaded && drillsLoaded && connectionsLoaded && routinesReady;
                const StatusIcon = ({ ready }: { ready: boolean }) =>
                  ready ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <CircleDashed className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                  );
                return (
                  <div
                    className="mt-3 rounded-xl bg-secondary/40 px-3 py-2"
                    data-testid="block-download-status"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Downloaded for offline
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-center gap-2" data-testid="status-app-shell">
                        <StatusIcon ready={sw} />
                        <span className="flex-1">App ready to launch offline</span>
                      </li>
                      <li className="flex items-center gap-2" data-testid="status-account">
                        <StatusIcon ready={accountReady} />
                        <span className="flex-1">Account &amp; points to fix</span>
                      </li>
                      <li className="flex items-center gap-2" data-testid="status-skills">
                        <StatusIcon ready={skillsLoaded} />
                        <span className="flex-1">
                          Skills{skillsLoaded ? ` (${skillsCount})` : ""}
                        </span>
                      </li>
                      <li className="flex items-center gap-2" data-testid="status-drills">
                        <StatusIcon ready={drillsLoaded} />
                        <span className="flex-1">
                          Drills{drillsLoaded ? ` (${drillsCount})` : ""}
                        </span>
                      </li>
                      <li className="flex items-center gap-2" data-testid="status-connections">
                        <StatusIcon ready={connectionsLoaded} />
                        <span className="flex-1">
                          Connections{connectionsLoaded ? ` (${connectionsCount})` : ""}
                        </span>
                      </li>
                      <li className="flex items-center gap-2" data-testid="status-routines">
                        <StatusIcon ready={routinesReady} />
                        <span className="flex-1">
                          Routines{routinesReady ? ` (${routinesCount})` : ""}
                        </span>
                      </li>
                    </ul>
                    {!allReady && isOnline && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Still downloading — keep the app open for a moment.
                      </p>
                    )}
                    {!allReady && !isOnline && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Some data isn't downloaded yet. Reconnect to finish.
                      </p>
                    )}
                    <p
                      className="text-[11px] text-muted-foreground mt-2"
                      data-testid="text-download-wipe-warning"
                    >
                      ⚠️ The download stays on this device through tab closes and restarts. It is wiped if you turn offline mode off, clear this site's browser data, or open the app in a different browser. The device may also evict it if storage runs very low.
                    </p>
                  </div>
                );
              })()}
              {offlineModeEnabled && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending sync</p>
                    <p
                      className="text-sm font-medium"
                      data-testid="text-pending-sync-count"
                    >
                      {pendingCount} {pendingCount === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg gap-1.5"
                    onClick={handleSyncNow}
                    disabled={draining || !isOnline || pendingCount === 0}
                    data-testid="btn-sync-now"
                  >
                    {draining ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Sync now
                  </Button>
                </div>
              )}
              {failedCount > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                        Rejected entries
                      </p>
                      <p
                        className="text-sm font-medium"
                        data-testid="text-rejected-count"
                      >
                        {failedCount} {failedCount === 1 ? "entry" : "entries"} the server wouldn't accept
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg gap-1.5 border-destructive/40 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => setShowFailedDialog(true)}
                    data-testid="btn-view-rejected"
                  >
                    Review
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl card-3d p-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Preferences</h2>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-secondary/50 mt-0.5">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Time format</p>
              <p className="text-xs text-muted-foreground mb-3">Used in the training log and when adding entries.</p>
              <div className="inline-flex p-1 rounded-xl bg-secondary/50 border border-border/50">
                {(["12h", "24h"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTimeFormat(opt)}
                    className={cn(
                      "px-4 h-8 rounded-lg text-xs font-semibold transition-all",
                      timeFormat === opt
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    data-testid={`btn-time-format-${opt}`}
                  >
                    {opt === "12h" ? "12-hour" : "24-hour"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      <ConfirmDialog
        open={showSignOutAlert}
        onOpenChange={setShowSignOutAlert}
        title="Sign out?"
        description={signOutDescription}
        onConfirm={() => logout()}
        confirmLabel="Sign out"
      />

      <Dialog open={showFailedDialog} onOpenChange={setShowFailedDialog}>
        <DialogContent
          className="rounded-2xl max-w-[calc(100vw-32px)] sm:max-w-2xl p-5 sm:p-6 max-h-[85vh] overflow-hidden flex flex-col"
          data-testid="dialog-rejected-entries"
        >
          <DialogHeader>
            <DialogTitle>Rejected offline entries</DialogTitle>
            <DialogDescription>
              The server wouldn't accept these entries. Copy any details you need before discarding.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-2 space-y-3">
            {failedItems == null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : failedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No rejected entries.
              </p>
            ) : (
              failedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-2"
                  data-testid={`row-rejected-${item.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{kindLabel(item.kind)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Created {format(new Date(item.createdAt), "d MMM yyyy, HH:mm")}
                        {" · "}Rejected {format(new Date(item.failedAt), "d MMM yyyy, HH:mm")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0"
                      onClick={() => handleDiscardOne(item.id)}
                      data-testid={`btn-discard-rejected-${item.id}`}
                    >
                      Discard
                    </Button>
                  </div>
                  <p className="text-xs">
                    <span className="font-semibold text-destructive">HTTP {item.status}</span>
                    {item.errorMessage ? (
                      <span className="text-muted-foreground"> — {item.errorMessage}</span>
                    ) : null}
                  </p>
                  <pre
                    className="text-[11px] bg-background/60 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words border border-border/40"
                    data-testid={`text-rejected-body-${item.id}`}
                  >
                    {formatBody(item.body)}
                  </pre>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="mt-3 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowFailedDialog(false)}
              data-testid="btn-close-rejected"
            >
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => setConfirmDiscardAll(true)}
              disabled={!failedItems || failedItems.length === 0}
              data-testid="btn-discard-all-rejected"
            >
              Discard all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscardAll}
        onOpenChange={setConfirmDiscardAll}
        title="Discard all rejected entries?"
        description="They will be removed from this device permanently. Make sure you've copied anything you still need."
        onConfirm={handleDiscardAll}
        confirmLabel="Discard all"
      />
    </PageLayout>
  );
}
