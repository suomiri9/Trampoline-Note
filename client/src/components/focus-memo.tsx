import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Check, Loader2 } from "lucide-react";
import type { SafeUser } from "@shared/models/auth";

export function FocusMemo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(user?.focusMemo || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(user?.focusMemo || "");
  }, [user?.focusMemo]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const mutation = useMutation({
    mutationFn: async (focusMemo: string) => {
      const res = await apiRequest("PATCH", "/api/auth/focus-memo", { focusMemo });
      return res.json() as Promise<SafeUser>;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
    },
    onError: () => {
      setText(user?.focusMemo || "");
      toast({ title: "Failed to save focus notes", variant: "destructive" });
    },
  });

  const savingRef = useRef(false);

  const handleSave = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const trimmed = text.trim();
    setIsEditing(false);
    if (trimmed !== (user?.focusMemo || "")) {
      mutation.mutate(trimmed);
      setText(trimmed);
    }
    requestAnimationFrame(() => { savingRef.current = false; });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setText(user?.focusMemo || "");
      setIsEditing(false);
    }
  };

  const displayText = user?.focusMemo || "";

  return (
    <div
      data-testid="focus-memo-card"
      className="mb-6 rounded-2xl border border-border bg-card/50 shadow-sm shadow-black/5 p-4 cursor-pointer transition-colors hover:bg-card/80"
      onClick={() => {
        if (!isEditing) setIsEditing(true);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg shrink-0 mt-0.5">
          <Pencil className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Focus Notes</span>
            {mutation.isPending && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" data-testid="focus-memo-saving" />
            )}
            {isEditing && (
              <button
                data-testid="focus-memo-save"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                className="p-1 rounded-md hover:bg-secondary transition-colors"
              >
                <Check className="w-4 h-4 text-primary" />
              </button>
            )}
          </div>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              data-testid="focus-memo-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              placeholder="Tap to add focus notes..."
              maxLength={1000}
              rows={2}
              className="w-full bg-transparent text-sm text-foreground resize-none outline-none placeholder:text-muted-foreground/50"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p
              data-testid="focus-memo-text"
              className={`text-sm whitespace-pre-wrap ${displayText ? "text-foreground" : "text-muted-foreground/50 italic"}`}
            >
              {displayText || "Tap to add focus notes..."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
