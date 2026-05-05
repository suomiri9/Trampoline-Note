import { useState } from "react";
import { Settings as SettingsIcon, LogOut, Loader2, Mail, User as UserIcon, Clock, WifiOff, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { useTimeFormat } from "@/hooks/use-time-format";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { useOnline } from "@/hooks/use-online";
import { useQueueCount, drainQueue } from "@/lib/offline-queue";
import { enableOfflineMode, disableOfflineMode } from "@/lib/offline-control";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);
  const [timeFormat, setTimeFormat] = useTimeFormat();
  const [offlineModeEnabled, setOfflineModeEnabled] = useOfflineMode();
  const isOnline = useOnline();
  const pendingCount = useQueueCount();
  const [busyToggle, setBusyToggle] = useState(false);
  const [draining, setDraining] = useState(false);

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
      const { synced } = await drainQueue();
      if (synced > 0) toast({ title: `Synced ${synced} offline ${synced === 1 ? "entry" : "entries"}.` });
      else toast({ title: "Nothing to sync." });
    } finally {
      setDraining(false);
    }
  };

  const handleSignOutClick = () => setShowSignOutAlert(true);

  const signOutDescription =
    pendingCount > 0
      ? `You have ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} waiting to sync — signing out will lose ${pendingCount === 1 ? "it" : "them"}.`
      : "Are you sure you want to sign out of your account?";

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

      <main className="space-y-6 max-w-2xl">
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
              className="w-full justify-start gap-2 h-11 rounded-xl text-sm text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 mt-2"
              onClick={handleSignOutClick}
              disabled={isLoggingOut}
              data-testid="btn-sign-out"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Sign out
            </Button>
          </div>
        </section>

        <section className="rounded-2xl card-3d p-5">
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
              <p className="text-xs text-muted-foreground mt-1">
                Avoid using multiple devices while offline mode is on to prevent mix-ups. Anything you create offline will sync when you reconnect.
              </p>
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
    </PageLayout>
  );
}
