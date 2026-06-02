import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SortableSkillRowProps {
  uid: string;
  code?: string;
  name?: string;
  isDrill?: number;
  onRemove: () => void;
}

export function SortableSkillRow({ uid, code, name, isDrill, onRemove }: SortableSkillRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-1 py-0.5"
    >
      <button type="button" className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Badge variant="outline" className={cn(
          "font-mono text-[10px] shrink-0",
          isDrill === 1 ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400" :
          isDrill === 3 ? "border-gray-400 text-gray-600 dark:border-gray-600 dark:text-gray-300" :
          isDrill === 2 ? "border-red-300 text-red-500 dark:border-red-700 dark:text-red-400" :
          "border-primary/30 text-primary"
        )}>{code}</Badge>
        <span className="text-xs truncate">{name}</span>
      </div>
      <button type="button" onClick={onRemove} className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
