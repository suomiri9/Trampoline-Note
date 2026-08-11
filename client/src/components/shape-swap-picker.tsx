import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { SHAPE_OPTIONS } from "@/components/shape-drafts-editor";
import { shapeSwapInfo, skillDisplayCode } from "@/lib/training-utils";
import { useBottomSheet } from "@/hooks/use-bottom-sheet";
import { cn } from "@/lib/utils";
import type { Skill } from "@shared/schema";

export function ShapeSwapPicker({
  open,
  onOpenChange,
  ids,
  allSkills,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: number[];
  allSkills: Skill[] | undefined;
  onPick: (shape: string) => void;
}) {
  const asSheet = useBottomSheet();
  const info = shapeSwapInfo(ids, allSkills, SHAPE_OPTIONS);

  const renderOptions = (rowClass?: string) => (
    <div className="space-y-2">
      {info.options.map(opt => {
        const missingNames = opt.missing
          .map(id => skillDisplayCode(allSkills?.find(s => s.id === id), allSkills))
          .filter(Boolean);
        const label = opt.word.toLowerCase();
        return (
          <div key={opt.shape}>
            <Button
              type="button"
              variant="outline"
              className={cn("w-full justify-start gap-2", rowClass)}
              disabled={!opt.available}
              onClick={() => {
                onPick(opt.shape);
                onOpenChange(false);
              }}
              data-testid={`btn-shape-swap-${label}`}
            >
              <span className="font-mono w-4 text-center">{opt.shape}</span>
              {opt.word}
            </Button>
            {!opt.available && missingNames.length > 0 && (
              <p
                className="text-[11px] text-muted-foreground mt-1 px-1"
                data-testid={`text-shape-missing-${label}`}
              >
                {missingNames.join(", ")} {missingNames.length === 1 ? "doesn't" : "don't"} have the {opt.word} shape
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  // Phones: gesture-driven bottom sheet (drag/flick to dismiss); desktop and
  // reduced-motion users keep the centered dialog.
  if (asSheet) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined} data-testid="sheet-shape-swap">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-xl">Duplicate w/ shape</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2">{renderOptions("min-h-11 rounded-xl")}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Duplicate w/ shape</DialogTitle>
        </DialogHeader>
        {renderOptions()}
      </DialogContent>
    </Dialog>
  );
}
