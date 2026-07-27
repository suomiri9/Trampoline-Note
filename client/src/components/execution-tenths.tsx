import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InsertExecutionSession } from "@shared/schema";
import {
  EXECUTION_SKILL_COUNT,
  tenthsToPoints,
  totalDeductionPoints,
  impliedEScore,
} from "@shared/execution";

// Shared building blocks for entering execution deductions the way judges'
// sheets print them: 10 skill cells + 1 landing cell, in tenths (2 = 0.2;
// landing 20 = 2.0; a final 0 = clean landing). Used by the Execution page
// and the Score page's "add the deductions too" step.

export const TENTHS_CELLS = EXECUTION_SKILL_COUNT + 1;
export const emptyTenths = () => Array.from({ length: TENTHS_CELLS }, () => "");

export interface ParsedRow {
  /** Per-skill deductions in tenths, contiguous from skill 1. */
  skills: number[];
  /** Landing deduction in tenths, or null when left blank. */
  landing: number | null;
  /** Something non-blank/invalid appears after the contiguous skill run. */
  trailing: boolean;
  landingInvalid: boolean;
  /** Total deduction in points. */
  total: number;
  /** Implied E score (20 - total) when the row is complete, else null. */
  e: number | null;
}

// Parse an 11-cell tenths row (shared by manual forms and photo reviews).
// `maxSkills` bounds how many skill cells count — a session against a shorter
// sequence target (connection / routine part) ignores cells beyond its
// length; the landing cell is always the last of the 11.
export function parseTenthsRow(cells: string[], maxSkills: number = EXECUTION_SKILL_COUNT): ParsedRow {
  const skills: number[] = [];
  for (let i = 0; i < maxSkills; i++) {
    const t = (cells[i] ?? "").trim();
    if (t === "") break;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 30) break;
    skills.push(n);
  }
  const trailing = cells
    .slice(skills.length, maxSkills)
    .some(v => (v ?? "").trim() !== "");
  const landingRaw = (cells[EXECUTION_SKILL_COUNT] ?? "").trim();
  const landingNum = landingRaw === "" ? null : Number(landingRaw);
  const landingInvalid =
    landingRaw !== "" && (!Number.isFinite(landingNum!) || landingNum! < 0 || landingNum! > 30);
  const landing = landingInvalid ? null : landingNum;
  const deductionPoints = skills.map(tenthsToPoints);
  const landingPoints = landing != null ? tenthsToPoints(landing) : null;
  return {
    skills,
    landing,
    trailing,
    landingInvalid,
    total: totalDeductionPoints(deductionPoints, landingPoints),
    e: impliedEScore(deductionPoints, landingPoints),
  };
}

export function tenthsRowToInsert(
  cells: string[],
  base: { date: string; routineId: number | null; skillId: number | null; category: "set" | "vol"; note: string | null },
  maxSkills: number = EXECUTION_SKILL_COUNT,
): InsertExecutionSession {
  const p = parseTenthsRow(cells, maxSkills);
  return {
    date: base.date,
    routineId: base.routineId,
    skillId: base.skillId,
    category: base.category,
    deductions: p.skills.map(tenthsToPoints),
    landingDeduction: p.landing != null ? tenthsToPoints(p.landing) : null,
    note: base.note,
  };
}

// The 11-cell entry grid. `labels`/`titles` let callers annotate the 10 skill
// cells with the routine's skill codes/names; unset cells fall back to "1".."10".
export function TenthsGrid({
  cells,
  onChange,
  labels,
  titles,
  testPrefix,
  skillCount = EXECUTION_SKILL_COUNT,
}: {
  cells: string[];
  onChange: (idx: number, value: string) => void;
  labels?: (string | undefined)[];
  titles?: (string | undefined)[];
  testPrefix: string;
  /** Skill cells to show (the target's sequence length); landing always shows. */
  skillCount?: number;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {cells.map((v, i) => {
        const isLanding = i === EXECUTION_SKILL_COUNT;
        if (!isLanding && i >= skillCount) return null;
        return (
          <div key={i} className="space-y-0.5">
            <div
              className="text-[9px] font-mono text-muted-foreground text-center truncate"
              title={isLanding ? "Landing deduction in tenths (0 = clean landing)" : titles?.[i]}
            >
              {isLanding ? "landing" : labels?.[i] ?? `${i + 1}`}
            </div>
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              max="30"
              placeholder="—"
              value={v}
              onChange={e => onChange(i, e.target.value)}
              className={cn("h-9 px-1 text-center font-mono text-xs", isLanding && "border-dashed")}
              data-testid={`${testPrefix}-${i}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function TenthsRowSummary({
  p,
  testId,
  skillCount = EXECUTION_SKILL_COUNT,
  unitLabel = "skills",
  showE = true,
  showCap = true,
}: {
  p: ParsedRow;
  testId: string;
  skillCount?: number;
  unitLabel?: string;
  /** An implied E score only makes sense for whole-routine attempts. */
  showE?: boolean;
  /** Hide the "/N" cap for open-ended attempt logging. */
  showCap?: boolean;
}) {
  return (
    <div className="flex justify-between items-center mt-2 text-xs font-mono">
      <span className="text-muted-foreground">{p.skills.length}{showCap ? `/${skillCount}` : ""} {unitLabel}{p.landing != null ? " + landing" : ""}</span>
      <span data-testid={testId}>
        <span className="text-muted-foreground">Total </span>
        <span className="font-bold text-foreground">−{p.total.toFixed(1)}</span>
        {showE && (
          <>
            <span className="text-muted-foreground"> · E </span>
            <span className={cn("font-bold", p.e != null ? "text-rose-400" : "text-muted-foreground")}>{p.e != null ? p.e.toFixed(1) : "—"}</span>
          </>
        )}
      </span>
    </div>
  );
}
