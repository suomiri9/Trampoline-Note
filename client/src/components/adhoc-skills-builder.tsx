import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Skill } from "@shared/schema";
import { pickableSkills, skillDisplayCode, skillDisplayName } from "@/lib/training-utils";

// Inline builder for an ad-hoc "connect skills" tracker target. Kept
// deliberately simple: tap skill buttons to build the sequence (repeats
// allowed), backspace removes the last one. Nothing is saved to the
// library — the ids live on the session row itself.
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
  const full = skillIds.length >= max;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-3 space-y-2" data-testid={`${testPrefix}-adhoc-builder`}>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-h-9 rounded-md border border-white/[0.07] bg-background px-2 py-1.5 flex flex-wrap items-center gap-y-1 font-mono text-sm">
          {skillIds.length === 0 ? (
            <span className="text-xs text-muted-foreground">Tap skills below, in order</span>
          ) : (
            skillIds.map((id, i) => {
              const sk = allSkills?.find(s => s.id === id);
              return (
                <span key={`${id}-${i}`} data-testid={`${testPrefix}-adhoc-chip-${i}`} title={sk ? skillDisplayName(sk, allSkills) : undefined}>
                  {i > 0 && <span className="text-muted-foreground/60 mx-1">+</span>}
                  <span className="font-bold">{sk ? skillDisplayCode(sk, allSkills) : `#${id}`}</span>
                </span>
              );
            })
          )}
        </div>
        {skillIds.length > 0 && (
          <button
            type="button"
            className="h-9 w-9 shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => onChange(skillIds.slice(0, -1))}
            aria-label="Remove last skill"
            data-testid={`${testPrefix}-adhoc-backspace`}
          >
            <Delete className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(s => (
          <button
            key={s.id}
            type="button"
            disabled={full}
            onClick={() => onChange([...skillIds, s.id])}
            title={skillDisplayName(s, allSkills)}
            className={cn(
              "rounded-md border border-white/[0.08] bg-secondary px-2.5 py-1.5 text-xs font-mono font-bold transition-colors",
              full ? "opacity-40" : "hover:bg-white/[0.06] active:scale-95",
            )}
            data-testid={`${testPrefix}-adhoc-pick-${s.id}`}
          >
            {skillDisplayCode(s, allSkills)}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {skillIds.length < 2
          ? "Tap at least 2 skills in the order you jump them — nothing is added to your library."
          : `${skillIds.length}/${max} skills connected.`}
      </p>
    </div>
  );
}
