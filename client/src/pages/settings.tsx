import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  LogOut,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  X,
} from "lucide-react";
import { version as appVersion } from "../../../package.json";
import { cacheGet } from "@/lib/offline-db";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@shared/routes";
import type { Skill } from "@shared/schema";
import { pickableSkills, skillDisplayCode } from "@/lib/training-utils";
import { PageLayout } from "@/components/page-layout";
import { PageHeader } from "@/components/page-header";
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
import { useArchiveCascade } from "@/hooks/use-archive-cascade";
import { useTrackTurns } from "@/hooks/use-track-turns";
import { useTheme } from "@/hooks/use-theme";
import { useShowSkillNames } from "@/hooks/use-skill-label-mode";
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
import { pushAccountSettings } from "@/lib/settings-sync";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function SettingsPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [showSignOutAlert, setShowSignOutAlert] = useState(false);
  const [timeFormat, setTimeFormat] = useTimeFormat();
  const [offlineModeEnabled, setOfflineModeEnabled] = useOfflineMode();
  const [archiveCascade, setArchiveCascade] = useArchiveCascade();
  const [trackTurns, setTrackTurns] = useTrackTurns();
  const { theme, setTheme } = useTheme();
  const [showSkillNames, setShowSkillNames] = useShowSkillNames();
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
  // AI menu-reading settings (stored on the user, fed to the coach prompt).
  const [menuGuideDraft, setMenuGuideDraft] = useState<string | null>(null);
  const menuSettingsMutation = useMutation({
    mutationFn: async (body: { menuGuide?: string; menuRowConnections?: boolean }) => {
      const res = await apiRequest("PATCH", "/api/auth/menu-settings", body);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/auth/user"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save",
        description: err.message || "Something went wrong saving the menu settings.",
        variant: "destructive",
      });
    },
  });
  const savedMenuGuide = user?.menuGuide ?? "";
  const menuGuideValue = menuGuideDraft ?? savedMenuGuide;
  const menuGuideDirty = menuGuideDraft !== null && menuGuideDraft !== savedMenuGuide;
  // Alias builder: pick a skill/drill from the library, type what the menu
  // calls it, and the pair is appended to the guide text (still hand-editable).
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: [api.skills.list.path] });
  const [aliasSkillId, setAliasSkillId] = useState<string>("");
  const [aliasText, setAliasText] = useState("");
  const aliasableSkills = pickableSkills(allSkills ?? [], 0);
  const aliasableDrills = pickableSkills(allSkills ?? [], 1);
  const addAlias = () => {
    const skill = (allSkills ?? []).find((s) => String(s.id) === aliasSkillId);
    const alias = aliasText.trim();
    if (!skill || !alias) return;
    const code = skillDisplayCode(skill, allSkills ?? []);
    const line = `${alias} = ${code} (${skill.name})`;
    setMenuGuideDraft((menuGuideValue ? `${menuGuideValue.replace(/\s+$/, "")}\n` : "") + line);
    setAliasSkillId("");
    setAliasText("");
  };
  // The guide stays ONE text field, but lines in the canonical alias format
  // "alias = CODE (Name)" (written by the Add button above or by the AI coach)
  // are lifted out and rendered as rows with a skill tag; everything else
  // stays free text in the textarea below. Removing a row / editing the notes
  // rebuilds the combined guide string, so the dirty Save/Cancel flow and the
  // AI full-replace semantics are unchanged.
  const parsedGuide = useMemo(() => {
    const lines = menuGuideValue.split("\n");
    const aliasEntries: { index: number; line: string; alias: string; code: string; name: string }[] = [];
    const noteLines: { index: number; line: string }[] = [];
    lines.forEach((line, index) => {
      const m = line.match(/^\s*(.+?)\s*=\s*(\S+)\s*\((.+)\)\s*$/);
      if (m) aliasEntries.push({ index, line, alias: m[1], code: m[2], name: m[3] });
      else noteLines.push({ index, line });
    });
    // Group entries by skill code so the same skill shows as one row with
    // multiple alias tags.
    const groupMap = new Map<string, { code: string; name: string; aliases: { index: number; alias: string }[] }>();
    for (const e of aliasEntries) {
      if (!groupMap.has(e.code)) groupMap.set(e.code, { code: e.code, name: e.name, aliases: [] });
      groupMap.get(e.code)!.aliases.push({ index: e.index, alias: e.alias });
    }
    return { lines, aliasRows: aliasEntries, aliasGroups: Array.from(groupMap.values()), notes: noteLines.map((l) => l.line).join("\n") };
  }, [menuGuideValue]);
  const removeAlias = (lineIndex: number) => {
    setMenuGuideDraft(parsedGuide.lines.filter((_, i) => i !== lineIndex).join("\n").trim());
  };
  const setGuideNotes = (notesText: string) => {
    const aliasLines = parsedGuide.aliasRows.map((r) => r.line);
    setMenuGuideDraft([...aliasLines, notesText].join("\n").replace(/^\n+|\n+$/g, ""));
  };
  const skillByCode = (code: string) =>
    (allSkills ?? []).find((s) => skillDisplayCode(s, allSkills ?? []) === code);
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
      <PageHeader
        eyebrow="Account"
        title="App Settings"
        accent="Settings"
        subtitle="Manage your preferences and account."
      />

      <main>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <div className="rounded-2xl card-3d p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl font-display font-normal text-white shrink-0" data-testid="avatar-profile">
                    {(displayName?.[0] ?? "A").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-lg leading-tight truncate" data-testid="text-settings-name">{displayName}</p>
                    {user?.email && <p className="text-sm text-muted-foreground truncate" data-testid="text-settings-email">{user.email}</p>}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 rounded-lg text-sm text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0"
                  onClick={handleSignOutClick}
                  disabled={isLoggingOut}
                  data-testid="btn-sign-out"
                >
                  {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  Sign out
                </Button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="eyebrow mb-3">Preferences</div>

              {/* ── Appearance ── */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">Appearance</p>
                <div className="rounded-2xl card-3d divide-y divide-border/60 overflow-hidden">
                  <div id="appearance" className="p-5 scroll-mt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Dark Mode</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{theme === "dark" ? "On — the near-black theme." : "Off — using the light theme."}</p>
                      </div>
                      <Switch
                        checked={theme === "dark"}
                        onCheckedChange={(v) => { setTheme(v ? "dark" : "light"); pushAccountSettings({ theme: v ? "dark" : "light" }); }}
                        data-testid="toggle-theme"
                      />
                    </div>
                  </div>
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Show Skill Names</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{showSkillNames ? "On — skill chips show full names." : "Off — skill chips show short codes."}</p>
                    </div>
                    <Switch
                      checked={showSkillNames}
                      onCheckedChange={(v) => { setShowSkillNames(v); pushAccountSettings({ showSkillNames: v }); }}
                      data-testid="toggle-skill-names"
                    />
                  </div>
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Track Turns</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{trackTurns ? "On — sessions show turn numbers, counts and efficiency stats." : "Off — no turn numbers, counts or efficiency stats."}</p>
                    </div>
                    <Switch
                      checked={trackTurns}
                      onCheckedChange={(v) => { setTrackTurns(v); pushAccountSettings({ trackTurns: v }); }}
                      data-testid="toggle-track-turns"
                    />
                  </div>
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Time Format</p>
                      <p className="text-xs text-muted-foreground mt-0.5">How times are displayed.</p>
                    </div>
                    <div className="inline-flex p-1 rounded-xl bg-secondary/50 border border-border/50 shrink-0">
                      {(["12h", "24h"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => { setTimeFormat(opt); pushAccountSettings({ timeFormat: opt }); }}
                          className={cn(
                            "px-4 h-8 rounded-lg text-xs font-semibold transition-all",
                            timeFormat === opt
                              ? "bg-background shadow-sm text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          data-testid={`btn-time-format-${opt}`}
                        >
                          {opt === "12h" ? "12h" : "24h"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Sync & Offline ── */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">Sync &amp; Offline</p>
                <div className="rounded-2xl card-3d divide-y divide-border/60 overflow-hidden">
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Archive Parts &amp; Connections With Routine</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{archiveCascade ? "On — archiving a routine also archives its routine parts and tagged connections." : "Off — routine parts and connections keep their own archived state."}</p>
                    </div>
                    <Switch
                      checked={archiveCascade}
                      onCheckedChange={(v) => { setArchiveCascade(v); pushAccountSettings({ archiveCascade: v }); }}
                      data-testid="toggle-archive-cascade"
                    />
                  </div>
                  <div id="offline" className="p-5 scroll-mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Offline Mode</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{offlineModeEnabled ? "On — entries sync when you reconnect." : "Save sessions and scores with no connection."}</p>
                      <p className="text-[11px] text-muted-foreground mt-1" data-testid="text-offline-storage-note">
                        Uses barely any storage — years of training data is smaller than one photo.
                      </p>
                    </div>
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
                </div>{/* closes id="offline" */}
              </div>{/* closes Sync & Offline card */}
            </div>{/* closes Sync & Offline category */}

              {/* ── AI Coach ── */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">AI Coach</p>
                <div className="rounded-2xl card-3d divide-y divide-border/60 overflow-hidden">
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Rows Are Connections</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {user?.menuRowConnections
                          ? "On — when the AI coach reads a training menu, each row with several skills becomes one connection."
                          : "Off — the AI coach logs menu skills as separate items unless a row clearly chains them."}
                      </p>
                    </div>
                    <Switch
                      checked={!!user?.menuRowConnections}
                      onCheckedChange={(v) => menuSettingsMutation.mutate({ menuRowConnections: v })}
                      disabled={menuSettingsMutation.isPending}
                      data-testid="toggle-menu-row-connections"
                    />
                  </div>
                  <div className="p-5">
                    <p className="text-sm font-medium">Menu Notation Guide</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tell the AI coach what your menu abbreviations mean so photo menus turn into accurate draft entries.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Select value={aliasSkillId} onValueChange={setAliasSkillId}>
                        <SelectTrigger
                          className="h-9 w-full sm:w-[220px] rounded-lg text-sm"
                          data-testid="select-alias-skill"
                        >
                          <SelectValue placeholder="Pick a skill or drill…" />
                        </SelectTrigger>
                        <SelectContent>
                          {aliasableSkills.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Skills</SelectLabel>
                              {aliasableSkills.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)} data-testid={`option-alias-skill-${s.id}`}>
                                  <span className="font-mono">{skillDisplayCode(s, allSkills ?? [])}</span> — {s.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {aliasableDrills.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Drills</SelectLabel>
                              {aliasableDrills.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)} data-testid={`option-alias-drill-${s.id}`}>
                                  <span className="font-mono">{skillDisplayCode(s, allSkills ?? [])}</span> — {s.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        value={aliasText}
                        onChange={(e) => setAliasText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addAlias(); }
                        }}
                        placeholder="What your menu calls it, e.g. cr"
                        maxLength={100}
                        className="h-9 flex-1 min-w-[140px] rounded-lg text-sm"
                        data-testid="input-alias-name"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-lg"
                        onClick={addAlias}
                        disabled={!aliasSkillId || !aliasText.trim()}
                        data-testid="btn-alias-add"
                      >
                        Add
                      </Button>
                    </div>
                    {parsedGuide.aliasGroups.length > 0 && (
                      <div className="mt-2 rounded-lg border border-border/50 divide-y divide-border/50">
                        {parsedGuide.aliasGroups.map((g) => {
                          const skill = skillByCode(g.code);
                          return (
                            <div
                              key={g.code}
                              className="flex items-center gap-2 px-3 py-2.5 min-w-0 flex-wrap"
                              data-testid={`row-alias-group-${g.code}`}
                            >
                              <span className="inline-flex items-center justify-center h-6 px-2 rounded-full border border-border font-mono text-xs shrink-0">
                                {g.code}
                              </span>
                              <span className="text-sm shrink-0">{skill?.name ?? g.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">called</span>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {g.aliases.map(({ index, alias }: { index: number; alias: string }) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-1 rounded-md bg-secondary/60 border border-border/50 px-2 h-6 text-sm font-medium"
                                    data-testid={`text-alias-${index}`}
                                  >
                                    {alias}
                                    <button
                                      type="button"
                                      onClick={() => removeAlias(index)}
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label={`Remove alias ${alias}`}
                                      data-testid={`btn-alias-remove-${index}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Textarea
                      value={parsedGuide.notes}
                      onChange={(e) => setGuideNotes(e.target.value)}
                      placeholder="Other notation notes — e.g. a number alone means that skill from my library…"
                      rows={3}
                      maxLength={10000}
                      className="mt-2 text-sm"
                      data-testid="textarea-menu-guide"
                    />
                    {menuGuideDirty && (
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => setMenuGuideDraft(null)}
                          disabled={menuSettingsMutation.isPending}
                          data-testid="btn-menu-guide-cancel"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 rounded-lg gap-1.5"
                          onClick={() =>
                            menuSettingsMutation.mutate(
                              { menuGuide: menuGuideValue },
                              { onSuccess: () => setMenuGuideDraft(null) },
                            )
                          }
                          disabled={menuSettingsMutation.isPending}
                          data-testid="btn-menu-guide-save"
                        >
                          {menuSettingsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>{/* closes space-y-5 */}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl card-3d p-4 text-center">
              <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">Trampoline Note · v{appVersion}</span>
              <div className="mt-1.5">
                <Link
                  href="/privacy"
                  className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 underline underline-offset-4 hover:text-foreground transition-colors"
                  data-testid="link-privacy-policy"
                >
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        </div>
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
          className="rounded-2xl max-w-[calc(100vw-32px)] sm:max-w-2xl p-5 sm:p-6 max-h-[85dvh] overflow-hidden flex flex-col"
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
