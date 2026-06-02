import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tryNetworkOrEnqueueFocusMemo } from "@/lib/offline-queue";
import { useAuth } from "@/hooks/use-auth";
import { useSkills } from "@/hooks/use-skills";
import { useQueuedFocusMemoPointIds } from "@/hooks/use-queued-focus-memo-point-ids";
import { useToast } from "@/hooks/use-toast";
import { PendingSyncBadge } from "@/components/pending-sync-badge";
import { Wrench, Plus, X, Trash2, Loader2, Search, Pencil, Check, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SafeUser } from "@shared/models/auth";
import type { Routine } from "@shared/schema";

export type PointToFix = {
  id: string;
  name: string;
  skillIds: number[];
  routineIds: number[];
  /** Sub-category for unlinked points. Ignored when the point is linked to
      any skill or routine. Defaults to "General" for legacy points. */
  category?: string;
};

export const POINT_CATEGORIES = [
  "General",
  "Forward",
  "Backward",
  "Twisting",
  "Connection",
  "Landing",
] as const;
export type PointCategory = typeof POINT_CATEGORIES[number];

const isPointCategory = (v: unknown): v is PointCategory =>
  typeof v === "string" && (POINT_CATEGORIES as readonly string[]).includes(v);

type LinkType = "skill" | "drill" | "connection" | "routine";

const TYPE_LABEL: Record<LinkType, string> = {
  skill: "Skill",
  drill: "Drill",
  connection: "Connection",
  routine: "Routine",
};

const TYPE_ORDER: Record<LinkType, number> = {
  skill: 0,
  drill: 1,
  connection: 2,
  routine: 3,
};

export function parsePoints(raw: string | null | undefined): PointToFix[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object" && typeof p.name === "string")
      .map((p, i) => ({
        id: typeof p.id === "string" ? p.id : `p-${i}-${Date.now()}`,
        name: p.name as string,
        // Allow negative ids so items linked to skills/routines that were
        // created offline (and still have a temporary id) keep their
        // links until the queue drains and remaps them to real ids.
        skillIds: Array.isArray(p.skillIds)
          ? (p.skillIds as unknown[]).filter(
              (x): x is number => typeof x === "number" && Number.isInteger(x) && x !== 0,
            )
          : [],
        routineIds: Array.isArray(p.routineIds)
          ? (p.routineIds as unknown[]).filter(
              (x): x is number => typeof x === "number" && Number.isInteger(x) && x !== 0,
            )
          : [],
        category: isPointCategory(p.category) ? p.category : undefined,
      }));
  } catch {
    // Legacy plain-text focus memo — migrate each non-empty line into a point.
    return trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((line, i) => ({
        id: `legacy-${i}-${Date.now()}`,
        name: line,
        skillIds: [],
        routineIds: [],
      }));
  }
}

interface PointsToFixProps {
  /** Hide the default trigger button (for externally controlled usage). */
  hideTrigger?: boolean;
  /** Controlled open state. When provided, the dialog is controlled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pre-select a filter (skill/routine) whenever the dialog opens. */
  initialFilter?: { kind: "skill" | "routine"; id: number } | null;
}

export function PointsToFix({
  hideTrigger = false,
  open: openProp,
  onOpenChange,
  initialFilter = null,
}: PointsToFixProps = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: skills } = useSkills();
  const { data: routines } = useQuery<Routine[]>({ queryKey: ["/api/routines"] });
  const queuedPointIds = useQueuedFocusMemoPointIds();

  const points = useMemo(() => parsePoints(user?.focusMemo), [user?.focusMemo]);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [draftName, setDraftName] = useState("");
  const [draftSkillIds, setDraftSkillIds] = useState<number[]>([]);
  const [draftRoutineIds, setDraftRoutineIds] = useState<number[]>([]);
  const [draftCategory, setDraftCategory] = useState<PointCategory>("General");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [filterKind, setFilterKind] = useState<"skill" | "routine" | null>(null);
  const [filterId, setFilterId] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    fromSkillId: number | null;
    fromRoutineId: number | null;
  } | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const hasDraft =
    draftName.trim().length > 0 ||
    draftSkillIds.length > 0 ||
    draftRoutineIds.length > 0;

  useEffect(() => {
    if (!open) {
      setDraftName("");
      setDraftSkillIds([]);
      setDraftRoutineIds([]);
      setDraftCategory("General");
      setFilterKind(null);
      setFilterId(null);
      setFilterOpen(false);
      setLinkOpen(false);
      setAddOpen(false);
      setEditingId(null);
      setEditingName("");
    }
  }, [open]);

  useEffect(() => {
    if (open && initialFilter) {
      setFilterKind(initialFilter.kind);
      setFilterId(initialFilter.id);
    }
  }, [open, initialFilter]);

  const startEdit = (p: PointToFix) => {
    setEditingId(p.id);
    setEditingName(p.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = () => {
    if (mutation.isPending) return;
    if (editingId === null) return;
    const name = editingName.trim();
    if (!name) return;
    const editedId = editingId;
    const next = points.map((p) => (p.id === editedId ? { ...p, name } : p));
    mutation.mutate({ next, pendingIds: [editedId] });
    setEditingId(null);
    setEditingName("");
  };

  const mutation = useMutation({
    mutationFn: async ({
      next,
      pendingIds,
    }: {
      next: PointToFix[];
      pendingIds: string[];
    }) => {
      const focusMemoStr = JSON.stringify(next);
      return await tryNetworkOrEnqueueFocusMemo<SafeUser>(
        focusMemoStr,
        async (signal) => {
          const res = await fetch("/api/auth/focus-memo", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ focusMemo: focusMemoStr }),
            signal,
          });
          if (!res.ok) {
            throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
          }
          return res.json() as Promise<SafeUser>;
        },
        12000,
        pendingIds,
      );
    },
    onSuccess: (updatedUser: any) => {
      // tryNetworkOrEnqueueFocusMemo already updates the user cache when
      // it queues the change offline, but writing it again here keeps
      // the online and offline paths uniform.
      if (updatedUser) {
        queryClient.setQueryData(["/api/auth/user"], updatedUser);
      }
    },
    onError: () => {
      toast({ title: "Failed to save points to fix", variant: "destructive" });
    },
  });

  const skillTypeOf = (isDrill: number | null | undefined): LinkType =>
    isDrill === 1 ? "drill" : isDrill === 2 ? "connection" : "skill";

  const sortedActiveSkills = useMemo(
    () =>
      (skills || [])
        .filter((s) => s.archived !== 1)
        .slice()
        .sort((a, b) => {
          const tA = TYPE_ORDER[skillTypeOf(a.isDrill)];
          const tB = TYPE_ORDER[skillTypeOf(b.isDrill)];
          if (tA !== tB) return tA - tB;
          const oA = a.sortOrder ?? 999999;
          const oB = b.sortOrder ?? 999999;
          if (oA !== oB) return oA - oB;
          return b.difficulty - a.difficulty;
        }),
    [skills],
  );

  const sortedActiveRoutines = useMemo(
    () =>
      (routines || [])
        .filter((r) => r.archived !== 1)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [routines],
  );

  const addSkillToDraft = (val: string) => {
    // val format: "skill:<id>" or "routine:<id>"
    const [kind, idStr] = val.split(":");
    const id = parseInt(idStr);
    if (!Number.isFinite(id)) return;
    if (kind === "routine") {
      setDraftRoutineIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setDraftSkillIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  };

  const removeSkillFromDraft = (id: number) => {
    setDraftSkillIds((prev) => prev.filter((x) => x !== id));
  };

  const removeRoutineFromDraft = (id: number) => {
    setDraftRoutineIds((prev) => prev.filter((x) => x !== id));
  };

  const addPoint = () => {
    if (mutation.isPending) return;
    const name = draftName.trim();
    if (!name) return;
    const isUnlinkedDraft =
      draftSkillIds.length === 0 && draftRoutineIds.length === 0;
    const newPoint: PointToFix = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      skillIds: draftSkillIds,
      routineIds: draftRoutineIds,
      ...(isUnlinkedDraft ? { category: draftCategory } : {}),
    };
    mutation.mutate({ next: [...points, newPoint], pendingIds: [newPoint.id] });
    setDraftName("");
    setDraftSkillIds([]);
    setDraftRoutineIds([]);
    setDraftCategory("General");
    setAddOpen(false);
  };

  const setPointCategory = (id: string, category: PointCategory) => {
    if (mutation.isPending) return;
    const target = points.find((p) => p.id === id);
    if (!target) return;
    if (target.skillIds.length > 0 || target.routineIds.length > 0) return;
    if ((target.category ?? "General") === category) return;
    const next = points.map((p) => (p.id === id ? { ...p, category } : p));
    mutation.mutate({ next, pendingIds: [id] });
  };

  const removePoint = (
    id: string,
    fromSkillId: number | null,
    fromRoutineId: number | null,
  ) => {
    if (mutation.isPending) return;
    const target = points.find((p) => p.id === id);
    if (!target) return;
    const totalLinks = target.skillIds.length + target.routineIds.length;
    if (fromSkillId !== null && totalLinks > 1) {
      mutation.mutate({
        next: points.map((p) =>
          p.id === id ? { ...p, skillIds: p.skillIds.filter((sid) => sid !== fromSkillId) } : p,
        ),
        pendingIds: [id],
      });
      return;
    }
    if (fromRoutineId !== null && totalLinks > 1) {
      mutation.mutate({
        next: points.map((p) =>
          p.id === id
            ? { ...p, routineIds: p.routineIds.filter((rid) => rid !== fromRoutineId) }
            : p,
        ),
        pendingIds: [id],
      });
      return;
    }
    mutation.mutate({ next: points.filter((p) => p.id !== id), pendingIds: [] });
  };

  const skillById = (id: number) => skills?.find((s) => s.id === id);
  const routineById = (id: number) => routines?.find((r) => r.id === id);

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          data-testid="button-points-to-fix"
          className="rounded-2xl h-12 px-4 font-semibold flex items-center gap-2 relative"
        >
          <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          Points to Fix
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && hasDraft) {
            setConfirmClose(true);
            return;
          }
          setOpen(next);
        }}
      >
        <DialogContent ref={dialogContentRef} className="sm:max-w-[500px] md:max-w-[680px] w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Points to Fix
              {mutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {points.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                No points yet. Add one below.
              </p>
            ) : (
              (() => {
                const groupsBySkill = new Map<number, PointToFix[]>();
                const groupsByRoutine = new Map<number, PointToFix[]>();
                const unlinked: PointToFix[] = [];
                for (const p of points) {
                  if (p.skillIds.length === 0 && p.routineIds.length === 0) {
                    unlinked.push(p);
                  } else {
                    for (const sid of p.skillIds) {
                      const arr = groupsBySkill.get(sid) || [];
                      arr.push(p);
                      groupsBySkill.set(sid, arr);
                    }
                    for (const rid of p.routineIds) {
                      const arr = groupsByRoutine.get(rid) || [];
                      arr.push(p);
                      groupsByRoutine.set(rid, arr);
                    }
                  }
                }
                const orderedSkillIds = sortedActiveSkills
                  .map((s) => s.id)
                  .filter((id) => groupsBySkill.has(id));
                for (const id of Array.from(groupsBySkill.keys())) {
                  if (!orderedSkillIds.includes(id)) orderedSkillIds.push(id);
                }
                const orderedRoutineIds = sortedActiveRoutines
                  .map((r) => r.id)
                  .filter((id) => groupsByRoutine.has(id));
                for (const id of Array.from(groupsByRoutine.keys())) {
                  if (!orderedRoutineIds.includes(id)) orderedRoutineIds.push(id);
                }

                const hasFilter = filterKind !== null && filterId !== null;
                const filteredSkillIds =
                  filterKind === "skill" && filterId !== null
                    ? orderedSkillIds.filter((id) => id === filterId)
                    : filterKind === "routine"
                      ? []
                      : orderedSkillIds;
                const filteredRoutineIds =
                  filterKind === "routine" && filterId !== null
                    ? orderedRoutineIds.filter((id) => id === filterId)
                    : filterKind === "skill"
                      ? []
                      : orderedRoutineIds;
                const showUnlinked = !hasFilter && unlinked.length > 0;
                const noResults =
                  hasFilter && filteredSkillIds.length === 0 && filteredRoutineIds.length === 0;

                const filterSkill =
                  filterKind === "skill" && filterId !== null ? skillById(filterId) : null;
                const filterRoutine =
                  filterKind === "routine" && filterId !== null ? routineById(filterId) : null;
                const filterLabel = filterSkill
                  ? filterSkill.code === filterSkill.name
                    ? filterSkill.code
                    : `${filterSkill.code} - ${filterSkill.name}`
                  : filterRoutine
                    ? filterRoutine.name
                    : "";

                const renderPointRow = (
                  p: PointToFix,
                  currentSkillId: number | null,
                  currentRoutineId: number | null,
                ) => {
                  const isEditing = editingId === p.id;
                  return (
                    <div
                      key={`${currentSkillId ?? "u"}-${currentRoutineId ?? "u"}-${p.id}`}
                      data-testid={`point-row-${p.id}`}
                      className="flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl bg-secondary/30"
                    >
                      {isEditing ? (
                        <>
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            maxLength={200}
                            autoFocus
                            data-testid={`input-edit-point-${p.id}`}
                            className="flex-1 min-w-0 h-8 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingName.trim()) {
                                e.preventDefault();
                                saveEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={saveEdit}
                            disabled={!editingName.trim() || mutation.isPending}
                            data-testid={`button-save-point-${p.id}`}
                            className="shrink-0 h-6 w-6 opacity-70 hover:opacity-100"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={cancelEdit}
                            data-testid={`button-cancel-edit-point-${p.id}`}
                            className="shrink-0 h-6 w-6 -mr-1 opacity-50 hover:opacity-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <p
                            className="text-sm flex-1 min-w-0 break-words"
                            data-testid={`text-point-name-${p.id}`}
                          >
                            {p.name}
                            {queuedPointIds.has(p.id) && (
                              <>
                                {" "}
                                <PendingSyncBadge
                                  size="xs"
                                  className="align-middle inline-flex"
                                  testId={`badge-pending-point-${p.id}`}
                                />
                              </>
                            )}
                          </p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={mutation.isPending || editingId !== null}
                                data-testid={`button-point-actions-${p.id}`}
                                className="shrink-0 h-6 w-6 -mr-1 opacity-50 hover:opacity-100"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 rounded-xl">
                              <DropdownMenuItem
                                className="cursor-pointer gap-2 text-xs"
                                onClick={() => startEdit(p)}
                                data-testid={`button-edit-point-${p.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              {p.skillIds.length === 0 && p.routineIds.length === 0 && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger
                                    className="cursor-pointer gap-2 text-xs"
                                    data-testid={`button-category-point-${p.id}`}
                                  >
                                    Category
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="rounded-xl">
                                    <DropdownMenuRadioGroup
                                      value={p.category ?? "General"}
                                      onValueChange={(v) =>
                                        setPointCategory(p.id, v as PointCategory)
                                      }
                                    >
                                      {POINT_CATEGORIES.map((c) => (
                                        <DropdownMenuRadioItem
                                          key={c}
                                          value={c}
                                          className="cursor-pointer text-xs"
                                          data-testid={`button-set-category-${p.id}-${c.toLowerCase()}`}
                                        >
                                          {c}
                                        </DropdownMenuRadioItem>
                                      ))}
                                    </DropdownMenuRadioGroup>
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: p.id,
                                    fromSkillId: currentSkillId,
                                    fromRoutineId: currentRoutineId,
                                  })
                                }
                                data-testid={`button-remove-point-${p.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  );
                };

                const renderCard = (
                  key: string,
                  testId: string,
                  header: React.ReactNode,
                  groupPoints: PointToFix[],
                  currentSkillId: number | null,
                  currentRoutineId: number | null,
                ) => (
                  <div
                    key={key}
                    data-testid={testId}
                    className="card-3d p-3 sm:p-5 rounded-2xl"
                  >
                    <div className="flex justify-between items-center mb-3">
                      {header}
                    </div>
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-border/40">
                      {groupPoints.map((p) =>
                        renderPointRow(p, currentSkillId, currentRoutineId),
                      )}
                    </div>
                  </div>
                );

                const filterSkillsList = sortedActiveSkills.filter(
                  (s) => groupsBySkill.has(s.id) && s.isDrill === 0,
                );
                const filterDrillsList = sortedActiveSkills.filter(
                  (s) => groupsBySkill.has(s.id) && s.isDrill === 1,
                );
                const filterConnList = sortedActiveSkills.filter(
                  (s) => groupsBySkill.has(s.id) && s.isDrill === 2,
                );
                const filterRoutinesList = sortedActiveRoutines.filter((r) =>
                  groupsByRoutine.has(r.id),
                );

                return (
                  <div className="space-y-3">
                    <div className="flex gap-2 min-w-0">
                      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className="rounded-xl h-11 flex-1 min-w-0 justify-start font-normal text-muted-foreground"
                            data-testid="btn-open-filter"
                          >
                            <Search className="h-4 w-4 mr-2 opacity-60 shrink-0" />
                            {hasFilter ? (
                              <span className="truncate min-w-0 flex-1 text-left text-foreground">{filterLabel}</span>
                            ) : (
                              <span className="truncate min-w-0 flex-1 text-left">Search...</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          container={dialogContentRef.current}
                          className="p-0 w-[--radix-popover-trigger-width]"
                          align="start"
                        >
                          <Command
                            filter={(value, search) => {
                              const v = value.toLowerCase();
                              const s = search.toLowerCase();
                              return v.includes(s) ? 1 : 0;
                            }}
                          >
                            <CommandInput
                              placeholder="Search by name or code..."
                              className="h-10"
                            />
                            <CommandList className="max-h-[320px]">
                              <CommandEmpty>No matches.</CommandEmpty>
                              {filterSkillsList.length > 0 && (
                                <CommandGroup heading="Skills">
                                  {filterSkillsList.map((s) => (
                                    <CommandItem
                                      key={`fs-${s.id}`}
                                      value={`${s.code} ${s.name} skill`}
                                      onSelect={() => {
                                        setFilterKind("skill");
                                        setFilterId(s.id);
                                        setFilterOpen(false);
                                      }}
                                      data-testid={`filter-skill-${s.id}`}
                                    >
                                      <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                        {s.code}
                                      </span>
                                      {s.code !== s.name && (
                                        <span className="text-muted-foreground">- {s.name}</span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {filterDrillsList.length > 0 && (
                                <CommandGroup heading="Drills">
                                  {filterDrillsList.map((s) => (
                                    <CommandItem
                                      key={`fd-${s.id}`}
                                      value={`${s.code} ${s.name} drill`}
                                      onSelect={() => {
                                        setFilterKind("skill");
                                        setFilterId(s.id);
                                        setFilterOpen(false);
                                      }}
                                      data-testid={`filter-drill-${s.id}`}
                                    >
                                      <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                        {s.code}
                                      </span>
                                      {s.code !== s.name && (
                                        <span className="text-muted-foreground">- {s.name}</span>
                                      )}
                                      <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-yellow-600 dark:text-yellow-400">
                                        Drill
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {filterConnList.length > 0 && (
                                <CommandGroup heading="Connections">
                                  {filterConnList.map((s) => (
                                    <CommandItem
                                      key={`fc-${s.id}`}
                                      value={`${s.name} connection`}
                                      onSelect={() => {
                                        setFilterKind("skill");
                                        setFilterId(s.id);
                                        setFilterOpen(false);
                                      }}
                                      data-testid={`filter-conn-${s.id}`}
                                    >
                                      <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                        {s.name}
                                      </span>
                                      <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-red-500 dark:text-red-400">
                                        Connection
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {filterRoutinesList.length > 0 && (
                                <CommandGroup heading="Routines">
                                  {filterRoutinesList.map((r) => (
                                    <CommandItem
                                      key={`fr-${r.id}`}
                                      value={`${r.name} routine`}
                                      onSelect={() => {
                                        setFilterKind("routine");
                                        setFilterId(r.id);
                                        setFilterOpen(false);
                                      }}
                                      data-testid={`filter-routine-${r.id}`}
                                    >
                                      <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                        {r.name}
                                      </span>
                                      <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-blue-600 dark:text-blue-400">
                                        Routine
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {hasFilter && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-11 shrink-0 rounded-xl px-3"
                          onClick={() => {
                            setFilterKind(null);
                            setFilterId(null);
                          }}
                          data-testid="button-clear-filter"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <Popover
                        open={addOpen}
                        onOpenChange={(v) => {
                          if (!v && hasDraft) return;
                          setAddOpen(v);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            className="h-11 shrink-0 rounded-xl px-3 gap-1"
                            data-testid="button-open-add-point"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          container={dialogContentRef.current}
                          className="w-[min(360px,calc(100vw-48px))] p-3 space-y-3"
                          align="end"
                          onInteractOutside={(e) => {
                            if (hasDraft) e.preventDefault();
                          }}
                          onEscapeKeyDown={(e) => {
                            if (hasDraft) e.preventDefault();
                          }}
                        >
                          {draftSkillIds.length === 0 && draftRoutineIds.length === 0 && (
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                Category
                              </label>
                              <div className="flex flex-wrap gap-1">
                                {POINT_CATEGORIES.map((c) => {
                                  const active = draftCategory === c;
                                  return (
                                    <Button
                                      key={c}
                                      type="button"
                                      size="sm"
                                      variant={active ? "default" : "outline"}
                                      onClick={() => setDraftCategory(c)}
                                      className="h-7 px-2.5 rounded-lg text-[11px] font-medium"
                                      data-testid={`button-draft-category-${c.toLowerCase()}`}
                                    >
                                      {c}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                              Or link to skills or routines
                            </label>
                            {(() => {
                              const linkSkillsList = sortedActiveSkills.filter(
                                (s) => s.isDrill === 0 && !draftSkillIds.includes(s.id),
                              );
                              const linkDrillsList = sortedActiveSkills.filter(
                                (s) => s.isDrill === 1 && !draftSkillIds.includes(s.id),
                              );
                              const linkConnList = sortedActiveSkills.filter(
                                (s) => s.isDrill === 2 && !draftSkillIds.includes(s.id),
                              );
                              const linkRoutinesList = sortedActiveRoutines.filter(
                                (r) => !draftRoutineIds.includes(r.id),
                              );
                              return (
                                <Popover open={linkOpen} onOpenChange={setLinkOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      role="combobox"
                                      className="rounded-xl h-10 w-full justify-start font-normal text-muted-foreground text-xs"
                                      data-testid="btn-open-link"
                                    >
                                      <Search className="h-4 w-4 mr-2 opacity-60" />
                                      Add skill, drill, connection or routine...
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    container={dialogContentRef.current}
                                    className="p-0 w-[--radix-popover-trigger-width]"
                                    align="start"
                                  >
                                    <Command
                                      filter={(value, search) => {
                                        const v = value.toLowerCase();
                                        const s = search.toLowerCase();
                                        return v.includes(s) ? 1 : 0;
                                      }}
                                    >
                                      <CommandInput
                                        placeholder="Search by name or code..."
                                        className="h-10"
                                      />
                                      <CommandList className="max-h-[260px]">
                                        <CommandEmpty>No matches.</CommandEmpty>
                                        {linkSkillsList.length > 0 && (
                                          <CommandGroup heading="Skills">
                                            {linkSkillsList.map((s) => (
                                              <CommandItem
                                                key={`ls-${s.id}`}
                                                value={`${s.code} ${s.name} skill`}
                                                onSelect={() => {
                                                  addSkillToDraft(`skill:${s.id}`);
                                                  setLinkOpen(false);
                                                }}
                                                data-testid={`option-skill-${s.id}`}
                                              >
                                                <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                                  {s.code}
                                                </span>
                                                {s.code !== s.name && (
                                                  <span className="text-muted-foreground">- {s.name}</span>
                                                )}
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                        {linkDrillsList.length > 0 && (
                                          <CommandGroup heading="Drills">
                                            {linkDrillsList.map((s) => (
                                              <CommandItem
                                                key={`ld-${s.id}`}
                                                value={`${s.code} ${s.name} drill`}
                                                onSelect={() => {
                                                  addSkillToDraft(`skill:${s.id}`);
                                                  setLinkOpen(false);
                                                }}
                                                data-testid={`option-drill-${s.id}`}
                                              >
                                                <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                                  {s.code}
                                                </span>
                                                {s.code !== s.name && (
                                                  <span className="text-muted-foreground">- {s.name}</span>
                                                )}
                                                <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-yellow-600 dark:text-yellow-400">
                                                  Drill
                                                </span>
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                        {linkConnList.length > 0 && (
                                          <CommandGroup heading="Connections">
                                            {linkConnList.map((s) => (
                                              <CommandItem
                                                key={`lc-${s.id}`}
                                                value={`${s.name} connection`}
                                                onSelect={() => {
                                                  addSkillToDraft(`skill:${s.id}`);
                                                  setLinkOpen(false);
                                                }}
                                                data-testid={`option-conn-${s.id}`}
                                              >
                                                <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                                  {s.name}
                                                </span>
                                                <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-red-500 dark:text-red-400">
                                                  Connection
                                                </span>
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                        {linkRoutinesList.length > 0 && (
                                          <CommandGroup heading="Routines">
                                            {linkRoutinesList.map((r) => (
                                              <CommandItem
                                                key={`lr-${r.id}`}
                                                value={`${r.name} routine`}
                                                onSelect={() => {
                                                  addSkillToDraft(`routine:${r.id}`);
                                                  setLinkOpen(false);
                                                }}
                                                data-testid={`option-routine-${r.id}`}
                                              >
                                                <span className="font-mono text-xs font-semibold text-foreground mr-2">
                                                  {r.name}
                                                </span>
                                                <span className="ml-auto text-[9px] uppercase tracking-wider font-semibold text-blue-600 dark:text-blue-400">
                                                  Routine
                                                </span>
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        )}
                                      </CommandList>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              );
                            })()}
                            {(draftSkillIds.length > 0 || draftRoutineIds.length > 0) && (
                              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/30">
                                {draftSkillIds.map((id) => {
                                  const s = skillById(id);
                                  const t = skillTypeOf(s?.isDrill);
                                  return (
                                    <Badge
                                      key={`ds-${id}`}
                                      variant="secondary"
                                      className="pr-1 gap-1"
                                      data-testid={`badge-draft-skill-${id}`}
                                    >
                                      <span className="font-mono">{s?.code || "?"}</span>
                                      <span className="text-[9px] uppercase opacity-70">
                                        {TYPE_LABEL[t]}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeSkillFromDraft(id)}
                                        data-testid={`button-remove-draft-skill-${id}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </Badge>
                                  );
                                })}
                                {draftRoutineIds.map((id) => {
                                  const r = routineById(id);
                                  return (
                                    <Badge
                                      key={`dr-${id}`}
                                      variant="secondary"
                                      className="pr-1 gap-1"
                                      data-testid={`badge-draft-routine-${id}`}
                                    >
                                      <span>{r?.name || "?"}</span>
                                      <span className="text-[9px] uppercase opacity-70">
                                        {TYPE_LABEL.routine}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeRoutineFromDraft(id)}
                                        data-testid={`button-remove-draft-routine-${id}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              New point
                            </label>
                            <Input
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              placeholder="e.g. Land cleaner, tighter tuck..."
                              maxLength={200}
                              data-testid="input-point-name"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && draftName.trim()) {
                                  e.preventDefault();
                                  addPoint();
                                }
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            onClick={addPoint}
                            disabled={!draftName.trim() || mutation.isPending}
                            data-testid="button-add-point"
                            className="w-full gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Add Point
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {noResults ? (
                      <p className="text-sm text-muted-foreground italic py-4 text-center">
                        No matches for "{filterLabel}".
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {showUnlinked && (() => {
                          const byCategory = new Map<PointCategory, PointToFix[]>();
                          for (const p of unlinked) {
                            const cat: PointCategory = isPointCategory(p.category)
                              ? p.category
                              : "General";
                            const arr = byCategory.get(cat) || [];
                            arr.push(p);
                            byCategory.set(cat, arr);
                          }
                          const orderedCats = POINT_CATEGORIES.filter((c) =>
                            byCategory.has(c),
                          );
                          if (orderedCats.length === 0) return null;
                          return (
                            <div className="grid gap-3 items-start [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                              <div
                                data-testid="group-category-general"
                                className="card-3d p-3 sm:p-5 rounded-2xl"
                                style={{ gridColumn: "span 2" }}
                              >
                                <div className="flex justify-between items-center mb-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-foreground truncate">
                                      General
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-3 pt-3 border-t border-border/40">
                                  {orderedCats.map((cat) => {
                                    const pts = byCategory.get(cat) || [];
                                    if (pts.length === 0) return null;
                                    return (
                                      <div
                                        key={cat}
                                        className="flex flex-col gap-1.5"
                                        data-testid={`section-category-${cat.toLowerCase()}`}
                                      >
                                        {orderedCats.length > 1 && (
                                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                            {cat}
                                          </div>
                                        )}
                                        {pts.map((p) =>
                                          renderPointRow(p, null, null),
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        <div className="grid gap-3 items-start [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                          {filteredSkillIds.map((sid) => {
                            const s = skillById(sid);
                            const groupPoints = groupsBySkill.get(sid) || [];
                            const t = skillTypeOf(s?.isDrill);
                            const typeColor =
                              t === "drill"
                                ? "text-yellow-600 dark:text-yellow-400"
                                : t === "connection"
                                  ? "text-red-500 dark:text-red-400"
                                  : "";
                            const sameCodeName = !!s && s.code === s.name;
                            const header = (
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {s?.code || "?"}
                                </span>
                                {!sameCodeName && (
                                  <>
                                    <span className="text-muted-foreground">-</span>
                                    <span className="text-sm text-muted-foreground truncate">
                                      {s?.name || "Unknown skill"}
                                    </span>
                                  </>
                                )}
                                {t !== "skill" && (
                                  <span
                                    className={`text-[9px] uppercase tracking-wider font-semibold shrink-0 ${typeColor}`}
                                  >
                                    {TYPE_LABEL[t]}
                                  </span>
                                )}
                              </div>
                            );
                            return renderCard(
                              `card-${sid}`,
                              `group-skill-${sid}`,
                              header,
                              groupPoints,
                              sid,
                              null,
                            );
                          })}
                          {filteredRoutineIds.map((rid) => {
                            const r = routineById(rid);
                            const groupPoints = groupsByRoutine.get(rid) || [];
                            const header = (
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {r?.name || "Unknown routine"}
                                </span>
                                <span className="text-[9px] uppercase tracking-wider font-semibold shrink-0 text-blue-600 dark:text-blue-400">
                                  {TYPE_LABEL.routine}
                                </span>
                              </div>
                            );
                            return renderCard(
                              `card-r-${rid}`,
                              `group-routine-${rid}`,
                              header,
                              groupPoints,
                              null,
                              rid,
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}

          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard unsaved point?"
        description="You have a point you haven't added yet. Closing will discard it."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmClose(false);
          setOpen(false);
        }}
      />

      {(() => {
        const target = deleteTarget
          ? points.find((p) => p.id === deleteTarget.id)
          : null;
        const totalLinks = target
          ? target.skillIds.length + target.routineIds.length
          : 0;
        const isUnlink =
          !!deleteTarget &&
          !!target &&
          totalLinks > 1 &&
          (deleteTarget.fromSkillId !== null || deleteTarget.fromRoutineId !== null);
        const groupName = deleteTarget?.fromSkillId
          ? skillById(deleteTarget.fromSkillId)?.code ||
            skillById(deleteTarget.fromSkillId)?.name ||
            "this group"
          : deleteTarget?.fromRoutineId
            ? routineById(deleteTarget.fromRoutineId)?.name || "this routine"
            : "this group";
        return (
          <ConfirmDialog
            open={deleteTarget !== null}
            onOpenChange={(o) => {
              if (!o) setDeleteTarget(null);
            }}
            title={isUnlink ? "Remove from this group?" : "Delete this point?"}
            description={
              target
                ? isUnlink
                  ? `"${target.name}" will be removed from ${groupName}, but kept in its other groups.`
                  : `"${target.name}" will be permanently deleted.`
                : "This action cannot be undone."
            }
            confirmLabel={isUnlink ? "Remove" : "Delete"}
            cancelLabel="Cancel"
            onConfirm={() => {
              if (deleteTarget) {
                removePoint(
                  deleteTarget.id,
                  deleteTarget.fromSkillId,
                  deleteTarget.fromRoutineId,
                );
              }
              setDeleteTarget(null);
            }}
          />
        );
      })()}
    </>
  );
}
