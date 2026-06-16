import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export type ShapeDraft = { id?: number; shape: string; name: string; difficulty: number };

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
}: {
  drafts: ShapeDraft[];
  onChange: (next: ShapeDraft[]) => void;
  namePlaceholder?: string;
  testIdPrefix?: string;
}) {
  const add = () => onChange([...drafts, { shape: "", name: "", difficulty: 0 }]);
  const patch = (i: number, p: Partial<ShapeDraft>) =>
    onChange(drafts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => onChange(drafts.filter((_, j) => j !== i));

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium leading-none">Shapes</label>
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
  );
}
