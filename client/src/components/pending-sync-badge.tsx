import { CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PendingSyncBadgeProps {
  testId?: string;
  className?: string;
  label?: string;
  withIcon?: boolean;
  size?: "sm" | "xs";
}

export function PendingSyncBadge({
  testId,
  className,
  label = "Pending sync",
  withIcon = true,
  size = "sm",
}: PendingSyncBadgeProps) {
  const sizing =
    size === "xs"
      ? "px-1.5 py-0 h-4 text-[9px]"
      : "px-2 py-0.5 h-6 text-[10px]";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-semibold border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-900/10",
        sizing,
        className,
      )}
      data-testid={testId}
    >
      {withIcon && <CloudOff className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />}
      {label}
    </Badge>
  );
}
