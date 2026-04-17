import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, X, Loader2, ChevronDown } from "lucide-react";
import type { FocusPoint, Skill } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PointsToFocusDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [skillFilter, setSkillFilter] = useState("");

  const { data: focusPoints, isLoading } = useQuery<FocusPoint[]>({
    queryKey: ["/api/focus-points"],
    enabled: open,
  });

  const { data: skills } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
    enabled: open,
  });

  const skillById = useMemo(() => {
    const map = new Map<number, Skill>();
    (skills || []).forEach((s) => map.set(s.id, s));
    return map;
  }, [skills]);

  const activeSkills = useMemo(
    () =>
      (skills || [])
        .filter((s) => s.archived === 0 && s.isDrill !== 2)
        .sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)),
    [skills]
  );

  const filteredSkills = useMemo(() => {
    const q = skillFilter.trim().toLowerCase();
    if (!q) return activeSkills;
    return activeSkills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [activeSkills, skillFilter]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/focus-points", {
        text: text.trim(),
        skillIds: selectedSkillIds,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-points"] });
      setText("");
      setSelectedSkillIds([]);
      setSkillFilter("");
    },
    onError: (e: Error) => {
      toast({ title: "Failed to add focus point", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/focus-points/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-points"] });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
    },
  });

  const toggleSkill = (id: number) => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAdd = () => {
    if (!text.trim() || createMutation.isPending) return;
    createMutation.mutate();
  };

  const general = (focusPoints || []).filter((p) => !p.skillIds || p.skillIds.length === 0);
  const perSkill = (focusPoints || []).filter((p) => p.skillIds && p.skillIds.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-points-to-focus">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
              <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            Points to Focus
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <Input
              data-testid="input-focus-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="What do you want to focus on?"
              maxLength={500}
            />
            <div className="flex items-center gap-2">
              <Popover open={skillPickerOpen} onOpenChange={setSkillPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1.5 h-9"
                    data-testid="button-pick-skills"
                  >
                    <span className="text-sm">
                      {selectedSkillIds.length === 0
                        ? "General point"
                        : `${selectedSkillIds.length} skill${selectedSkillIds.length > 1 ? "s" : ""}`}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <Input
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    placeholder="Search skills..."
                    className="h-8 mb-2"
                    data-testid="input-skill-filter"
                  />
                  <ScrollArea className="h-56">
                    <div className="space-y-1">
                      {filteredSkills.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                          No skills found
                        </p>
                      ) : (
                        filteredSkills.map((s) => (
                          <label
                            key={s.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
                            data-testid={`option-skill-${s.id}`}
                          >
                            <Checkbox
                              checked={selectedSkillIds.includes(s.id)}
                              onCheckedChange={() => toggleSkill(s.id)}
                            />
                            <span className="text-sm flex-1 min-w-0 truncate">
                              <span className="font-mono text-xs text-muted-foreground mr-1.5">
                                {s.code}
                              </span>
                              {s.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  {selectedSkillIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 h-8"
                      onClick={() => setSelectedSkillIds([])}
                      data-testid="button-clear-skills"
                    >
                      Clear selection
                    </Button>
                  )}
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                onClick={handleAdd}
                disabled={!text.trim() || createMutation.isPending}
                size="sm"
                className="rounded-lg ml-auto h-9 gap-1.5"
                data-testid="button-add-focus-point"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Add
              </Button>
            </div>
            {selectedSkillIds.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selectedSkillIds.map((id) => {
                  const s = skillById.get(id);
                  if (!s) return null;
                  return (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="gap-1 pr-1"
                      data-testid={`chip-selected-skill-${id}`}
                    >
                      <span className="text-xs">{s.code}</span>
                      <button
                        type="button"
                        onClick={() => toggleSkill(id)}
                        className="rounded-sm hover:bg-background/40 p-0.5"
                        aria-label={`Remove ${s.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* List */}
          <div>
            {isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (focusPoints || []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                No focus points yet. Add one above.
              </p>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="space-y-3 pr-2">
                  {general.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        General
                      </h4>
                      <ul className="space-y-1">
                        {general.map((p) => (
                          <FocusRow
                            key={p.id}
                            point={p}
                            skillById={skillById}
                            onDelete={() => deleteMutation.mutate(p.id)}
                            deleting={deleteMutation.isPending && deleteMutation.variables === p.id}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                  {perSkill.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Per-skill
                      </h4>
                      <ul className="space-y-1">
                        {perSkill.map((p) => (
                          <FocusRow
                            key={p.id}
                            point={p}
                            skillById={skillById}
                            onDelete={() => deleteMutation.mutate(p.id)}
                            deleting={deleteMutation.isPending && deleteMutation.variables === p.id}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FocusRow({
  point,
  skillById,
  onDelete,
  deleting,
}: {
  point: FocusPoint;
  skillById: Map<number, Skill>;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li
      data-testid={`row-focus-point-${point.id}`}
      className="flex items-start gap-2 rounded-lg border border-border p-2 group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground break-words">{point.text}</p>
        {point.skillIds && point.skillIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {point.skillIds.map((id) => {
              const s = skillById.get(id);
              return (
                <Badge key={id} variant="outline" className="text-[10px] py-0 h-5">
                  {s ? s.code : `#${id}`}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 opacity-50 group-hover:opacity-100"
        data-testid={`button-delete-focus-${point.id}`}
        aria-label="Delete focus point"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </button>
    </li>
  );
}
