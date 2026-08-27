import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useBottomSheet } from "@/hooks/use-bottom-sheet";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description = "This action cannot be undone.",
  onConfirm,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "destructive",
}: ConfirmDialogProps) {
  const asSheet = useBottomSheet();

  // Phones: a gesture-driven bottom sheet (vaul) — tracks the finger 1:1,
  // rubber-bands at the top, can be flicked away mid-animation, and commits
  // or cancels based on release velocity. Desktop and reduced-motion users
  // keep the centered dialog below.
  if (asSheet) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent data-testid="sheet-confirm">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pt-2">
            <Button
              variant={variant === "destructive" ? "destructive" : "default"}
              className="w-full min-h-11 rounded-xl"
              onClick={() => {
                onOpenChange(false);
                onConfirm();
              }}
              data-testid="button-confirm"
            >
              {confirmLabel}
            </Button>
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="w-full min-h-11 rounded-xl"
                data-testid="button-cancel"
              >
                {cancelLabel}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl max-w-[320px] sm:max-w-lg w-[calc(100vw-48px)] p-5 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl" data-testid="button-cancel">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            data-testid="button-confirm"
            className={
              variant === "destructive"
                ? "rounded-xl bg-destructive text-destructive-foreground"
                : "rounded-xl"
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
