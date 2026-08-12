"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

// Motion (emil-design-eng + docs/apple-design-skill.md §7): origin-anchored
// fade+zoom on the strong ease-out curve, 150ms in / 100ms out, no slide
// drift. When the provider skips the warm-up delay (second tooltip in the
// same sweep → data-state="instant-open") the animation is skipped too, so
// subsequent tooltips simply appear.
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-lg border border-border/60 bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md ease-out-strong duration-150 data-[state=closed]:duration-100 animate-in fade-in-0 motion-safe:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95 data-[state=instant-open]:animate-none origin-[--radix-tooltip-content-transform-origin]",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
