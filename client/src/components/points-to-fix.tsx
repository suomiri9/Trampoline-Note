import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSkills } from "@/hooks/use-skills";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, X, Trash2, Loader2, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SafeUser } from "@shared/models/auth";

export type PointToFix = {
  id: string;
  name: string;
  skillIds: number[];
  rating: number;
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
        rating:
          typeof p.rating === "number" && Number.isFinite(p.rating)
            ? Math.max(0, Math.min(5, Math.round(p.rating)))
            : 0,
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
        rating: 0,
      }));
  }
}

export function PointsToFix() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: skills } = useSkills();

  const points = useMemo(() => parsePoints(user?.focusMemo), [user?.focusMemo]);

  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSkillIds, setDraftSkillIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setDraftName("");
      setDraftSkillIds([]);
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

  const addSkillToDraft = (idStr: string) => {
    const id = parseInt(idStr);
    if (!Number.isFinite(id)) return;
    setDraftSkillIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeSkillFromDraft = (id: number) => {
    setDraftSkillIds((prev) => prev.filter((x) => x !== id));
  };

  const addPoint = () => {
    if (mutation.isPending) return;
    const name = draftName.trim();
    if (!name) return;
    const newPoint: PointToFix = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      skillIds: draftSkillIds,
      rating: 0,
    };
    mutation.mutate([...points, newPoint]);
    setDraftName("");
    setDraftSkillIds([]);
  };

  const removePoint = (id: string) => {
    if (mutation.isPending) return;
    mutation.mutate(points.filter((p) => p.id !== id));
  };

  const setRating = (id: string, rating: number) => {
    if (mutation.isPending) return;
    const clamped = Math.max(0, Math.min(5, rating));
    const target = points.find((p) => p.id === id);
    if (!target || target.rating === clamped) return;
    mutation.mutate(
      points.map((p) => (p.id === id ? { ...p, rating: clamped } : p)),
    );
  };

  const skillById = (id: number) => skills?.find((s) => s.id === id);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="button-points-to-fix"
        className="rounded-2xl h-12 px-4 font-semibold flex items-center gap-2 relative"
      >
        <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        Points to Fix
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
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
                const unlinked: PointToFix[] = [];
                for (const p of points) {
                  if (p.skillIds.length === 0) {
                    unlinked.push(p);
                  } else {
                    for (const sid of p.skillIds) {
                      const arr = groupsBySkill.get(sid) || [];
                      arr.push(p);
                      groupsBySkill.set(sid, arr);
                    }
                  }
                }
                const orderedSkillIds = sortedActiveSkills
                  .map((s) => s.id)
                  .filter((id) => groupsBySkill.has(id));
                for (const id of groupsBySkill.keys()) {
                  if (!orderedSkillIds.includes(id)) orderedSkillIds.push(id);
                }

                const q = searchQuery.trim().toLowerCase();
                const filteredSkillIds = q
                  ? orderedSkillIds.filter((id) => {
                      const s = skillById(id);
                      const code = (s?.code || "").toLowerCase();
                      const name = (s?.name || "").toLowerCase();
                      return code.includes(q) || name.includes(q);
                    })
                  : orderedSkillIds;
                const showUnlinked = !q && unlinked.length > 0;
                const noResults = q && filteredSkillIds.length === 0;

                const renderPointRow = (p: PointToFix, currentSkillId: number | null) => {
                  return (
                    <div
                      key={`${currentSkillId ?? "u"}-${p.id}`}
                      data-testid={`point-row-${p.id}`}
                      className="flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl bg-secondary/30"
                    >
                      <p
                        className="text-sm flex-1 min-w-0 break-words"
                        data-testid={`text-point-name-${p.id}`}
                      >
                        {p.name}
                      </p>
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        data-testid={`rating-${p.id}`}
                        role="radiogroup"
                        aria-label="Achievement rating"
                      >
                        {[1, 2, 3, 4, 5].map((n) => {
                          const filled = n <= p.rating;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                setRating(p.id, p.rating === n ? n - 1 : n)
                              }
                              disabled={mutation.isPending}
                              data-testid={`button-rating-${p.id}-${n}`}
                              aria-label={`Set rating to ${n}`}
                              className="p-0.5 rounded hover:scale-110 transition-transform disabled:opacity-50"
                            >
                              <Star
                                className={
                                  filled
                                    ? "w-3.5 h-3.5 fill-amber-400 text-amber-400"
                                    : "w-3.5 h-3.5 text-muted-foreground/40"
                                }
                              />
                            </button>
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePoint(p.id)}
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
                  currentSkillId: number | null,
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
                      {groupPoints.map((p) => renderPointRow(p, currentSkillId))}
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
                        placeholder="Search by skill name or code..."
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
                        No skills match "{searchQuery}".
                      </p>
                    ) : (
                      <div className="grid gap-3 items-start [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                        {filteredSkillIds.map((sid) => {
                          const s = skillById(sid);
                          const groupPoints = groupsBySkill.get(sid) || [];
                          const header = (
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge
                                variant="outline"
                                className="px-2 py-0.5 h-5 font-mono text-[10px] bg-background shadow-sm border-border/60 text-muted-foreground shrink-0"
                              >
                                {s?.code || "?"}
                              </Badge>
                              <span className="text-sm font-semibold text-foreground truncate">
                                {s?.name || "Unknown skill"}
                              </span>
                            </div>
                          );
                          return renderCard(
                            `card-${sid}`,
                            `group-skill-${sid}`,
                            header,
                            groupPoints,
                            sid,
                          );
                        })}
                        {showUnlinked &&
                          renderCard(
                            "card-unlinked",
                            "group-unlinked",
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-semibold text-foreground truncate">
                                General
                              </span>
                            </div>,
                            unlinked,
                            null,
                          )}
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
                  Linked skills (optional)
                </label>
                <Select value="" onValueChange={addSkillToDraft}>
                  <SelectTrigger data-testid="select-point-skill">
                    <SelectValue placeholder="Add a skill..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedActiveSkills
                      .filter((s) => !draftSkillIds.includes(s.id))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          <span className="font-mono mr-2">{s.code}</span>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {draftSkillIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/30">
                    {draftSkillIds.map((id) => {
                      const s = skillById(id);
                      return (
                        <Badge
                          key={id}
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
    </>
  );
}
