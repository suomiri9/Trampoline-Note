import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput } from "@/components/ui/command";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A combobox where the visible box IS the search input: the user types
 * directly into it and a popover with filtered results opens underneath.
 * Replaces the old "fake button trigger + second search box inside the
 * popover" pattern.
 *
 * The component owns the search text (cleared whenever the popover closes)
 * and syncs it into a hidden CommandInput so cmdk keeps filtering the
 * CommandList children exactly as before.
 */
export function SearchPicker({
  open,
  onOpenChange,
  placeholder,
  disabled,
  container,
  align = "start",
  inputTestId,
  className,
  inputClassName,
  inputRef: inputRefProp,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder: string;
  disabled?: boolean;
  /** Portal container for the popover (e.g. a dialog body). */
  container?: HTMLElement | null;
  align?: "start" | "center" | "end";
  inputTestId?: string;
  /** Wrapper div classes — size/border/background live here. */
  className?: string;
  /** Extra classes for the input element itself. */
  inputClassName?: string;
  /** Optional external ref to the input (e.g. for useTypeToSearch focusing). */
  inputRef?: RefObject<HTMLInputElement>;
  /** CommandList (+ groups/items) rendered inside the popover. */
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? internalInputRef;
  const commandRef = useRef<HTMLDivElement>(null);

  /** Re-dispatch a navigation key on the cmdk root so its built-in
   * highlight/selection handling works even though focus stays on the
   * visible outer input. */
  const forwardKeyToCommand = (e: React.KeyboardEvent) => {
    const cmd = commandRef.current;
    if (!cmd) return;
    e.preventDefault();
    cmd.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: e.key,
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div ref={wrapRef} className={cn("relative min-w-0", className)}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={search}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              "w-full h-full bg-transparent pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
              inputClassName,
            )}
            onFocus={() => {
              if (!disabled) onOpenChange(true);
            }}
            onClick={() => {
              if (!disabled && !open) onOpenChange(true);
            }}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open && !disabled) onOpenChange(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onOpenChange(false);
                inputRef.current?.blur();
                return;
              }
              if (
                e.key === "ArrowDown" ||
                e.key === "ArrowUp" ||
                e.key === "Enter" ||
                e.key === "Home" ||
                e.key === "End"
              ) {
                if (open) {
                  forwardKeyToCommand(e);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (!disabled) onOpenChange(true);
                }
              }
            }}
            data-testid={inputTestId}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        container={container}
        className="p-0 w-[--radix-popover-trigger-width]"
        align={align}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Tapping the input itself must not close (focus/typing keeps it open).
          if (wrapRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <Command
          ref={commandRef}
          filter={(value, s) => (value.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}
        >
          {/* Hidden controlled input keeps cmdk's filter in sync with the outer box. */}
          <div className="hidden">
            <CommandInput value={search} onValueChange={setSearch} />
          </div>
          {children}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
