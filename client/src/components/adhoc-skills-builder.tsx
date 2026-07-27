import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import type { Skill } from "@shared/schema";
import { pickableSkills, skillDisplayCode, skillDisplayName } from "@/lib/training-utils";

// Inline builder for an ad-hoc "connect skills" tracker target: chips show
// the chosen sequence in order, the select underneath appends another skill
// (the same skill can repeat). Nothing is saved to the library — the ids
// live on the session row itself.
export function AdhocSkillsBuilder({
  skillIds,
  onChange,
  allSkills,
  max = 10,
  testPrefix,
}: {
  skillIds: number[];
  onChange: (ids: number[]) => void;
  allSkills: Skill[] | undefined;
  max?: number;
  testPrefix: string;
}) {
  const options = pickableSkills(allSkills, 0)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2" data-testid={`${testPrefix}-adhoc-builder`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Connected skills, in order{skillIds.length > 0 ? ` (${skillIds.length}/${max})` : ""}
      </div>
      {skillIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skillIds.map((id, i) => {
            const sk = allSkills?.find(s => s.id === id);
            return (
              <span
                key={`${id}-${i}`}
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-mono"
                title={sk ? skillDisplayName(sk, allSkills) : undefined}
                data-testid={`${testPrefix}-adhoc-chip-${i}`}
              >
                <span className="text-muted-foreground">{i + 1}.</span>
                <span className="font-bold">{sk ? skillDisplayCode(sk, allSkills) : `#${id}`}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground ml-0.5"
                  onClick={() => onChange(skillIds.filter((_, j) => j !== i))}
                  aria-label={`Remove skill ${i + 1}`}
                  data-testid={`${testPrefix}-adhoc-remove-${i}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {skillIds.length < max && (
        <Select value="" onValueChange={v => onChange([...skillIds, Number(v)])}>
          <SelectTrigger className="h-8 text-xs" data-testid={`${testPrefix}-adhoc-add`}>
            <SelectValue placeholder="+ Add skill" />
          </SelectTrigger>
          <SelectContent>
            {options.map(s => (
              <SelectItem key={s.id} value={String(s.id)} className="text-xs">
                {skillDisplayCode(s, allSkills)} · {skillDisplayName(s, allSkills)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {skillIds.length < 2 && (
        <p className="text-[10px] text-muted-foreground">Pick at least 2 skills to connect — this won't be added to your library.</p>
      )}
    </div>
  );
}
