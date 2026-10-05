import type { ReactNode } from "react"
import { toast as sonnerToast } from "sonner"
import { haptics } from "@/lib/native-app"

// Thin adapter over Sonner (emil-design-eng — the Sonner principles:
// interruptible transition-based enter/exit, spatial consistency, velocity
// swipe dismissal). Keeps the pre-existing shadcn call-site API working:
//   const { toast } = useToast(); toast({ title, description, variant })
// The <Toaster /> lives in components/ui/toaster.tsx.

type ToastInput = {
  title?: ReactNode
  description?: ReactNode
  variant?: "default" | "destructive"
  duration?: number
}

function toast({ title, description, variant = "default", duration }: ToastInput) {
  const show = variant === "destructive" ? sonnerToast.error : sonnerToast
  if (variant === "destructive") haptics.error()
  else haptics.success()
  const id = show(title ?? description ?? "", {
    // If the title carried the message, surface description separately.
    description: title != null ? description : undefined,
    duration,
  })
  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
  }
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  }
}

export { useToast, toast }
