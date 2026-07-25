import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, X, Link2 } from "lucide-react";
import { useState } from "react";
import type { Skill } from "@shared/schema";
import { cn } from "@/lib/utils";

// `existing` marks a draft that relinks an ALREADY-SAVED skill as a shape of the
// base (vs a brand-new variant). For those, `id` is the existing skill's id and
// `code` is its original code — preserved on save so Detach restores it cleanly.
export type ShapeDraft = { id?: number; shape: string; name: string; difficulty: number; existing?: boolean; code?: string };

export const SHAPE_OPTIONS: { value: string; word: string }[] = [
  { value: "o", word: "Tuck" },
  { value: "<", word: "Pike" },
  { value: "/", word: "Straight" },
];

export function ShapeDraftsEditor({
  drafts,
  onChange,
  namePlaceholder = "Bs",
  testIdPrefix = "shape",
  assignableSkills,
}: {
  drafts: ShapeDraft[];
  onChange: (next: ShapeDraft[]) => void;
  namePlaceholder?: string;
  testIdPrefix?: string;
  // When provided, an "Assign existing" button appears that lets the user pull
  // one of these skills in as a shape variant (preserving its history/DD/code).
  assignableSkills?: Skill[];
}) {
  const add = () => onChange([...drafts, { shape: "", name: "", difficulty: 0 }]);
  const patch = (i: number, p: Partial<ShapeDraft>) =>
    onChange(drafts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => onChange(drafts.filter((_, j) => j !== i));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickShape, setPickShape] = useState<string>("");

  const usedIds = new Set(drafts.filter(d => d.id != null).map(d => d.id as number));
  const candidates = (assignableSkills || []).filter(s => !usedIds.has(s.id));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
    : candidates;

  const closePicker = () => {
    setPickerOpen(false);
    setSearch("");
    setSelectedId(null);
    setPickShape("");
  };

  const confirmAssign = () => {
    const skill = (assignableSkills || []).find(s => s.id === selectedId);
    if (!skill) return;
    onChange([
      ...drafts,
      { id: skill.id, existing: true, code: skill.code, shape: pickShape, name: skill.name, difficulty: skill.difficulty },
    ]);
    closePicker();
  };

  return (
    <>
      <div className="space-y-2 rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium leading-none">Shapes</label>
          <div className="flex items-center gap-2">
            {assignableSkills && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setPickerOpen(true)}
                data-testid={`button-assign-existing-${testIdPrefix}`}
              >
                <Link2 className="h-3.5 w-3.5" /> Assign existing
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={add}
              data-testid={`button-add-${testIdPrefix}`}
            >
              <Plus className="h-3.5 w-3.5" /> Add shape
            </Button>
          </div>
        </div>
        {drafts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No shapes. Add tuck / pike / straight variants with their own code and DD.</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((d, i) => (
              <div key={i} className="flex items-end gap-2" data-testid={`row-${testIdPrefix}-draft-${i}`}>
                <div className="w-28 space-y-1">
                  {i === 0 && <span className="eyebrow text-[10px]">Shape</span>}
                  <Select
                    value={d.shape || undefined}
                    onValueChange={v => patch(i, { shape: v })}
                  >
                    <SelectTrigger className="font-mono" data-testid={`select-${testIdPrefix}-code-${i}`}><SelectValue placeholder="Shape" /></SelectTrigger>
                    <SelectContent>
                      {SHAPE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="font-mono mr-2">{o.value}</span>{o.word}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  {i === 0 && <span className="eyebrow text-[10px]">Name</span>}
                  <Input
                    placeholder={namePlaceholder}
                    value={d.name}
                    onChange={e => patch(i, { name: e.target.value })}
                    data-testid={`input-${testIdPrefix}-name-${i}`}
                  />
                </div>
                <div className="w-20 space-y-1">
                  {i === 0 && <span className="eyebrow text-[10px]">DD</span>}
                  <Input
                    className="font-mono"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={Number.isFinite(d.difficulty) ? d.difficulty : 0}
                    onChange={e => patch(i, { difficulty: parseFloat(e.target.value) || 0 })}
                    data-testid={`input-${testIdPrefix}-dd-${i}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                  data-testid={`button-remove-${testIdPrefix}-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {assignableSkills && (
        <Dialog open={pickerOpen} onOpenChange={(o) => { if (!o) closePicker(); }}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign existing as shape</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Pull an existing skill in as a shape variant of this base. Its notes, history and DD are preserved.
              </p>
              <Input
                autoFocus
                placeholder="Search by name or code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid={`input-assign-search-${testIdPrefix}`}
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No matching skills.</p>
                ) : (
                  filtered.map(s => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                        selectedId === s.id ? "bg-primary/15" : "hover:bg-muted/50"
                      )}
                      data-testid={`option-assign-skill-${s.id}`}
                    >
                      <span className="font-mono text-xs text-muted-foreground w-16 shrink-0 truncate">{s.code}</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none">Shape</label>
                <Select value={pickShape || undefined} onValueChange={setPickShape}>
                  <SelectTrigger className="font-mono" data-testid={`select-assign-shape-${testIdPrefix}`}><SelectValue placeholder="Pick a shape..." /></SelectTrigger>
                  <SelectContent>
                    {SHAPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="font-mono mr-2">{o.value}</span>{o.word}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={selectedId == null || !pickShape}
                onClick={confirmAssign}
                data-testid={`button-confirm-assign-${testIdPrefix}`}
              >
                Assign as shape
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
