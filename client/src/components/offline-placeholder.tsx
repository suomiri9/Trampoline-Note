import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface OfflinePlaceholderProps {
  hint?: string;
  className?: string;
  testId?: string;
}

export function OfflinePlaceholder({
  hint = "It will be back when you reconnect.",
  className,
  testId,
}: OfflinePlaceholderProps) {
  return (
    <div
      className={cn(
        "rounded-2xl card-3d p-8 flex flex-col items-center text-center",
        className,
      )}
      data-testid={testId ?? "card-offline-placeholder"}
    >
      <div className="w-12 h-12 mb-4 rounded-full bg-secondary/40 flex items-center justify-center">
        <WifiOff className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-semibold mb-1">You are not connected to the internet.</p>
      <p className="text-sm text-muted-foreground max-w-xs">{hint}</p>
    </div>
  );
}
