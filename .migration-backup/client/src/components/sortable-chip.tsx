import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface SortableChipProps {
  uid: string;
  children: React.ReactNode;
  className?: string;
}

export function SortableChip({ uid, children, className }: SortableChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined }}
      className={cn("inline-flex select-none cursor-grab active:cursor-grabbing", className)}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
