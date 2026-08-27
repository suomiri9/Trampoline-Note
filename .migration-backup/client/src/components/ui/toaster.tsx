import type { CSSProperties } from "react"
import { Toaster as Sonner } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"

// Sonner toaster (emil-design-eng — the Sonner principles): enter/exit run on
// interruptible transitions (rapid-fire toasts retarget instead of restarting),
// each toast enters, exits and swipes at the SAME edge (spatial consistency),
// and swipe-to-dismiss is velocity-based out of the box.
// - Phones: top-center — clear of the floating bottom nav, pushed below the
//   iOS notch inset. Swipe up to dismiss.
// - Desktop: bottom-right, offset above the floating nav row.
// Exit-faster-than-enter + reduced-motion handling live in index.css.
export function Toaster() {
  const isMobile = useIsMobile()

  return (
    <Sonner
      position={isMobile ? "top-center" : "bottom-right"}
      duration={3000}
      gap={10}
      offset={{ right: "1rem", bottom: "5.5rem" }}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
        left: "1rem",
        right: "1rem",
      }}
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border) / 0.6)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group !rounded-xl !shadow-xl !shadow-black/30 font-sans",
          title: "!font-semibold",
          description:
            "!text-muted-foreground group-data-[type=error]:!text-destructive-foreground/90",
          error:
            "!bg-destructive !text-destructive-foreground !border-destructive-border",
        },
      }}
    />
  )
}
