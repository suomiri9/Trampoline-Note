import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function getDifficultyColor(difficulty: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  if (difficulty <= 0.4) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      text: "text-emerald-700 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      label: "Easy",
    };
  }
  if (difficulty <= 0.8) {
    return {
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      text: "text-yellow-700 dark:text-yellow-400",
      border: "border-yellow-200 dark:border-yellow-800",
      label: "Medium",
    };
  }
  if (difficulty <= 1.2) {
    return {
      bg: "bg-orange-50 dark:bg-orange-950/30",
      text: "text-orange-700 dark:text-orange-400",
      border: "border-orange-200 dark:border-orange-800",
      label: "Hard",
    };
  }
  return {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    label: "Expert",
  };
}

interface DifficultyBadgeProps {
  difficulty: number;
  className?: string;
  showLabel?: boolean;
}

export function DifficultyBadge({ difficulty, className, showLabel = false }: DifficultyBadgeProps) {
  const colors = getDifficultyColor(difficulty);

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[11px] font-semibold tabular-nums px-2 py-0.5",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
      data-testid="badge-difficulty"
    >
      {difficulty.toFixed(1)}
      {showLabel && <span className="ml-1 font-sans text-[10px] opacity-75">{colors.label}</span>}
    </Badge>
  );
}
