import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Check, Loader2, Plus, X } from "lucide-react";
import type { Skill } from "@shared/schema";

function parseLines(memo: string | null | undefined): string[] {
  if (!memo) return [];
  return memo.split("\n").filter((l) => l.trim() !== "");
}

function serializeLines(lines: string[]): string {
  return lines.filter((l) => l.trim() !== "").join("\n");
}

export function SkillFocusMemo({ skill }: { skill: Skill }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [lines, setLines] = useState<string[]>(() => parseLines(skill.focusMemo));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setLines(parseLines(skill.focusMemo));
  }, [skill.focusMemo, skill.id]);

  useEffect(() => {
    if (isEditing) {
      if (lines.length === 0) {
        setLines([""]);
      }
      requestAnimationFrame(() => {
        const lastRef = inputRefs.current[inputRefs.current.length - 1];
        if (lastRef) {
          lastRef.focus();
          lastRef.selectionStart = lastRef.selectionEnd = lastRef.value.length;
        }
      });
    }
  }, [isEditing]);

  const mutation = useMutation({
    mutationFn: async (focusMemo: string) => {
      const res = await apiRequest("PUT", `/api/skills/${skill.id}`, { focusMemo });
      return res.json() as Promise<Skill>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
    },
    onError: () => {
      setLines(parseLines(skill.focusMemo));
      toast({ title: "Failed to save focus notes", variant: "destructive" });
    },
  });

  const savingRef = useRef(false);

  const handleSave = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const cleaned = lines.filter((l) => l.trim() !== "");
    const serialized = serializeLines(cleaned);
    setLines(cleaned.length > 0 ? cleaned : []);
    setIsEditing(false);
    if (serialized !== (skill.focusMemo || "")) {
      mutation.mutate(serialized);
    }
    requestAnimationFrame(() => { savingRef.current = false; });
  };

  const updateLine = (index: number, value: string) => {
    const next = [...lines];
    next[index] = value;
    setLines(next);
  };

  const addLine = () => {
    setLines((prev) => [...prev, ""]);
    requestAnimationFrame(() => {
      const ref = inputRefs.current[lines.length];
      if (ref) ref.focus();
    });
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) {
      setLines([""]);
      inputRefs.current[0]?.focus();
      return;
    }
    const next = lines.filter((_, i) => i !== index);
    setLines(next);
    requestAnimationFrame(() => {
      const focusIdx = Math.min(index, next.length - 1);
      inputRefs.current[focusIdx]?.focus();
    });
  };

  const handleLineKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...lines];
      next.splice(index + 1, 0, "");
      setLines(next);
      requestAnimationFrame(() => {
        inputRefs.current[index + 1]?.focus();
      });
    }
    if (e.key === "Backspace" && lines[index] === "" && lines.length > 1) {
      e.preventDefault();
      removeLine(index);
    }
    if (e.key === "Escape") {
      setLines(parseLines(skill.focusMemo));
      setIsEditing(false);
    }
  };

  const displayLines = parseLines(skill.focusMemo);

  return (
    <div
      data-testid="skill-focus-memo-card"
      className="mb-6 rounded-2xl card-3d p-4 cursor-pointer transition-colors hover:bg-card/80"
      onClick={() => {
        if (!isEditing) setIsEditing(true);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg shrink-0 mt-0.5">
          <Pencil className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Focus Notes</span>
            {mutation.isPending && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" data-testid="skill-focus-memo-saving" />
            )}
            {isEditing && (
              <button
                data-testid="skill-focus-memo-save"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                className="p-1 rounded-md hover:bg-secondary transition-colors"
              >
                <Check className="w-4 h-4 text-primary" />
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0 select-none">•</span>
                  <input
                    ref={(el) => { inputRefs.current[i] = el; }}
                    data-testid={`skill-focus-memo-line-${i}`}
                    value={line}
                    onChange={(e) => updateLine(i, e.target.value)}
                    onKeyDown={(e) => handleLineKeyDown(e, i)}
                    onBlur={(e) => {
                      if (!e.currentTarget.closest('[data-testid="skill-focus-memo-card"]')?.contains(e.relatedTarget as Node)) {
                        handleSave();
                      }
                    }}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                    placeholder="Type here..."
                    maxLength={500}
                  />
                  <button
                    data-testid={`skill-focus-memo-remove-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeLine(i)}
                    className="p-0.5 rounded hover:bg-secondary transition-colors shrink-0 opacity-40 hover:opacity-100"
                    tabIndex={-1}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                data-testid="skill-focus-memo-add-line"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addLine}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                tabIndex={-1}
              >
                <Plus className="w-3 h-3" />
                <span>Add line</span>
              </button>
            </div>
          ) : (
            <div data-testid="skill-focus-memo-text">
              {displayLines.length > 0 ? (
                <ul className="space-y-0.5">
                  {displayLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="text-muted-foreground shrink-0 select-none">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">Tap to add focus notes...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
