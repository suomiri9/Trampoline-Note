import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSkills } from "@/hooks/use-skills";
import { useToast } from "@/hooks/use-toast";
import { Wrench, Plus, X, Trash2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SafeUser } from "@shared/models/auth";
import type { Routine } from "@shared/schema";

export type PointToFix = {
  id: string;
  name: string;
  skillIds: number[];
  routineIds: number[];
};

type GroupKind = "skill" | "drill" | "connection" | "routine";
const KIND_ORDER: Record<GroupKind, number> = { skill: 0, drill: 1, connection: 2, routine: 3 };
const KIND_LABEL: Record<GroupKind, string> = {
  skill: "Skill",
  drill: "Drill",
  connection: "Connection",
  routine: "Routine",
};

function parsePoints(raw: string | null | undefined): PointToFix[] {
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
        skillIds: Array.isArray(p.skillIds)
          ? (p.skillIds as unknown[]).filter(
              (x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0,
            )
          : [],
        routineIds: Array.isArray(p.routineIds)
          ? (p.routineIds as unknown[]).filter(
              (x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0,
            )
          : [],
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

export function PointsToFix() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: skills } = useSkills();
  const { data: routines } = useQuery<Routine[]>({ queryKey: ["/api/routines"] });

  const points = useMemo(() => parsePoints(user?.focusMemo), [user?.focusMemo]);

  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSkillIds, setDraftSkillIds] = useState<number[]>([]);
  const [draftRoutineIds, setDraftRoutineIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraftName("");
      setDraftSkillIds([]);
      setDraftRoutineIds([]);
      setSearchQuery("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (next: PointToFix[]) => {
      const res = await apiRequest("PATCH", "/api/auth/focus-memo", {
        focusMemo: JSON.stringify(next),
      });
      return res.json() as Promise<SafeUser>;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
    },
    onError: () => {
      toast({ title: "Failed to save points to fix", variant: "destructive" });
    },
  });

  const sortedActiveSkills = useMemo(
    () =>
      (skills || [])
        .filter((s) => s.archived !== 1)
        .slice()
        .sort((a, b) => {
          const oA = a.sortOrder ?? 999999;
          const oB = b.sortOrder ?? 999999;
          if (oA !== oB) return oA - oB;
          return b.difficulty - a.difficulty;
        }),
    [skills],
  );

  const sortedActiveRoutines = useMemo(
    () => (routines || []).filter((r) => r.archived !== 1).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [routines],
  );

  const addLinkToDraft = (val: string) => {
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
    const newPoint: PointToFix = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      skillIds: draftSkillIds,
      routineIds: draftRoutineIds,
    };
    mutation.mutate([...points, newPoint]);
    setDraftName("");
    setDraftSkillIds([]);
    setDraftRoutineIds([]);
  };

  const removePoint = (
    id: string,
    from: { kind: "skill" | "routine"; id: number } | null,
  ) => {
    if (mutation.isPending) return;
    const target = points.find((p) => p.id === id);
    if (!target) return;
    const totalLinks = target.skillIds.length + target.routineIds.length;
    if (from !== null && totalLinks > 1) {
      mutation.mutate(
        points.map((p) =>
          p.id === id
            ? {
                ...p,
                skillIds: from.kind === "skill" ? p.skillIds.filter((x) => x !== from.id) : p.skillIds,
                routineIds: from.kind === "routine" ? p.routineIds.filter((x) => x !== from.id) : p.routineIds,
              }
            : p,
        ),
      );
      return;
    }
    mutation.mutate(points.filter((p) => p.id !== id));
  };

  const skillById = (id: number) => skills?.find((s) => s.id === id);
  const routineById = (id: number) => routines?.find((r) => r.id === id);
  const skillKind = (s?: { isDrill?: number | null }): GroupKind => {
    if (!s) return "skill";
    if (s.isDrill === 1) return "drill";
    if (s.isDrill === 2) return "connection";
    return "skill";
  };

  return (
    <>
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && (draftName.trim() || draftSkillIds.length > 0 || draftRoutineIds.length > 0)) {
            setConfirmClose(true);
            return;
          }
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
                type Group = {
                  kind: GroupKind;
                  sortIndex: number;
                  key: string;
                  testId: string;
                  header: React.ReactNode;
                  points: PointToFix[];
                  from: { kind: "skill" | "routine"; id: number };
                  matchText: string;
                };

                const groupsBySkill = new Map<number, PointToFix[]>();
                const groupsByRoutine = new Map<number, PointToFix[]>();
                const unlinked: PointToFix[] = [];

                for (const p of points) {
                  const total = p.skillIds.length + p.routineIds.length;
                  if (total === 0) {
                    unlinked.push(p);
                    continue;
                  }
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

                const skillSortIndex = new Map<number, number>();
                sortedActiveSkills.forEach((s, i) => skillSortIndex.set(s.id, i));
                const routineSortIndex = new Map<number, number>();
                sortedActiveRoutines.forEach((r, i) => routineSortIndex.set(r.id, i));

                const groups: Group[] = [];

                for (const [sid, gp] of groupsBySkill.entries()) {
                  const s = skillById(sid);
                  const kind = skillKind(s);
                  const code = s?.code || "?";
                  const name = s?.name || "Unknown";
                  groups.push({
                    kind,
                    sortIndex: skillSortIndex.get(sid) ?? 999999,
                    key: `card-skill-${sid}`,
                    testId: `group-skill-${sid}`,
                    header: (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge
                          variant="outline"
                          className="px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm border-border/60 text-muted-foreground shrink-0"
                        >
                          {code}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground truncate">
                          {name}
                        </span>
                        <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4 shrink-0 uppercase tracking-wide">
                          {KIND_LABEL[kind]}
                        </Badge>
                      </div>
                    ),
                    points: gp,
                    from: { kind: "skill", id: sid },
                    matchText: `${code} ${name}`.toLowerCase(),
                  });
                }

                for (const [rid, gp] of groupsByRoutine.entries()) {
                  const r = routineById(rid);
                  const code = r?.code || null;
                  const name = r?.name || "Unknown routine";
                  groups.push({
                    kind: "routine",
                    sortIndex: routineSortIndex.get(rid) ?? 999999,
                    key: `card-routine-${rid}`,
                    testId: `group-routine-${rid}`,
                    header: (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {code && (
                          <Badge
                            variant="outline"
                            className="px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm border-border/60 text-muted-foreground shrink-0"
                          >
                            {code}
                          </Badge>
                        )}
                        <span className="text-sm font-semibold text-foreground truncate">
                          {name}
                        </span>
                        <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 h-4 shrink-0 uppercase tracking-wide">
                          {KIND_LABEL.routine}
                        </Badge>
                      </div>
                    ),
                    points: gp,
                    from: { kind: "routine", id: rid },
                    matchText: `${code ?? ""} ${name}`.toLowerCase(),
                  });
                }

                groups.sort((a, b) => {
                  const ko = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
                  if (ko !== 0) return ko;
                  return a.sortIndex - b.sortIndex;
                });

                const q = searchQuery.trim().toLowerCase();
                const filteredGroups = q
                  ? groups.filter((g) => g.matchText.includes(q))
                  : groups;
                const showUnlinked = !q && unlinked.length > 0;
                const noResults = q && filteredGroups.length === 0;

                const renderPointRow = (
                  p: PointToFix,
                  from: { kind: "skill" | "routine"; id: number } | null,
                ) => {
                  const fromKey = from ? `${from.kind}-${from.id}` : "u";
                  return (
                    <div
                      key={`${fromKey}-${p.id}`}
                      data-testid={`point-row-${p.id}`}
                      className="flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl bg-secondary/30"
                    >
                      <p
                        className="text-sm flex-1 min-w-0 break-words"
                        data-testid={`text-point-name-${p.id}`}
                      >
                        {p.name}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePoint(p.id, from)}
                        disabled={mutation.isPending}
                        data-testid={`button-remove-point-${p.id}`}
                        className="shrink-0 h-6 w-6 -mr-1 opacity-50 hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                };

                const renderCard = (
                  key: string,
                  testId: string,
                  header: React.ReactNode,
                  groupPoints: PointToFix[],
                  from: { kind: "skill" | "routine"; id: number } | null,
                ) => (
                  <div
                    key={key}
                    data-testid={testId}
                    className="card-3d p-4 sm:p-5 rounded-2xl"
                  >
                    <div className="flex justify-between items-center mb-3">
                      {header}
                    </div>
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-border/40">
                      {groupPoints.map((p) => renderPointRow(p, from))}
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or code..."
                        className="pl-9 pr-9"
                        data-testid="input-search-skill"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          data-testid="button-clear-search"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {noResults ? (
                      <p className="text-sm text-muted-foreground italic py-4 text-center">
                        No matches for "{searchQuery}".
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {showUnlinked && (
                          <div className="grid gap-3 items-start [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                            <div className="sm:col-span-2">
                              {renderCard(
                                "card-unlinked",
                                "group-unlinked",
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-sm font-semibold text-foreground truncate">
                                    General
                                  </span>
                                </div>,
                                unlinked,
                                null,
                              )}
                            </div>
                          </div>
                        )}
                        <div className="grid gap-3 items-start [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                          {filteredGroups.map((g) =>
                            renderCard(g.key, g.testId, g.header, g.points, g.from),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Add new point
              </p>
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

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Linked skills / routines (optional)
                </label>
                <Select value="" onValueChange={addLinkToDraft}>
                  <SelectTrigger data-testid="select-point-skill">
                    <SelectValue placeholder="Add a skill, drill, connection or routine..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(["skill", "drill", "connection"] as const).map((kind) => {
                      const items = sortedActiveSkills.filter(
                        (s) => skillKind(s) === kind && !draftSkillIds.includes(s.id),
                      );
                      if (items.length === 0) return null;
                      return (
                        <SelectGroup key={kind}>
                          <SelectLabel>{KIND_LABEL[kind]}s</SelectLabel>
                          {items.map((s) => (
                            <SelectItem key={`s-${s.id}`} value={`skill:${s.id}`}>
                              <span className="font-mono mr-2">{s.code}</span>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                    {sortedActiveRoutines.filter((r) => !draftRoutineIds.includes(r.id)).length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Routines</SelectLabel>
                        {sortedActiveRoutines
                          .filter((r) => !draftRoutineIds.includes(r.id))
                          .map((r) => (
                            <SelectItem key={`r-${r.id}`} value={`routine:${r.id}`}>
                              {r.code && <span className="font-mono mr-2">{r.code}</span>}
                              {r.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                {(draftSkillIds.length > 0 || draftRoutineIds.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/30">
                    {draftSkillIds.map((id) => {
                      const s = skillById(id);
                      return (
                        <Badge
                          key={`s-${id}`}
                          variant="secondary"
                          className="pr-1 gap-1"
                          data-testid={`badge-draft-skill-${id}`}
                        >
                          <span className="font-mono">{s?.code || "?"}</span>
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
                          key={`r-${id}`}
                          variant="secondary"
                          className="pr-1 gap-1"
                          data-testid={`badge-draft-routine-${id}`}
                        >
                          <span>{r?.name || "?"}</span>
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
            </div>
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
    </>
  );
}
