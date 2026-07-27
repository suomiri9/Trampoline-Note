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
export function parseTenthsRow(cells: string[]): ParsedRow {
  const skills: number[] = [];
  for (let i = 0; i < EXECUTION_SKILL_COUNT; i++) {
    const t = (cells[i] ?? "").trim();
    if (t === "") break;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 30) break;
    skills.push(n);
  }
  const trailing = cells
    .slice(skills.length, EXECUTION_SKILL_COUNT)
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
  base: { date: string; routineId: number; category: "set" | "vol"; note: string | null },
): InsertExecutionSession {
  const p = parseTenthsRow(cells);
  return {
    date: base.date,
    routineId: base.routineId,
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
}: {
  cells: string[];
  onChange: (idx: number, value: string) => void;
  labels?: (string | undefined)[];
  titles?: (string | undefined)[];
  testPrefix: string;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {cells.map((v, i) => {
        const isLanding = i === EXECUTION_SKILL_COUNT;
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

export function TenthsRowSummary({ p, testId }: { p: ParsedRow; testId: string }) {
  return (
    <div className="flex justify-between items-center mt-2 text-xs font-mono">
      <span className="text-muted-foreground">{p.skills.length}/{EXECUTION_SKILL_COUNT} skills{p.landing != null ? " + landing" : ""}</span>
      <span data-testid={testId}>
        <span className="text-muted-foreground">Total </span>
        <span className="font-bold text-foreground">−{p.total.toFixed(1)}</span>
        <span className="text-muted-foreground"> · E </span>
        <span className={cn("font-bold", p.e != null ? "text-rose-400" : "text-muted-foreground")}>{p.e != null ? p.e.toFixed(1) : "—"}</span>
      </span>
    </div>
  );
}
