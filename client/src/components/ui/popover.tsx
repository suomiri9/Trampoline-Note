import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { bottomNavClearance, cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>["container"];
};

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 4, container, collisionPadding, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding ?? { top: 10, left: 10, right: 10, bottom: bottomNavClearance() }}
      // Motion: fade+zoom growing from the trigger's corner (transform origin),
      // mirrored in/out, no overshoot; reduced motion keeps only the fade.
      className={cn(
        "z-50 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto w-72 rounded-xl border border-border/60 bg-popover p-4 text-popover-foreground shadow-xl shadow-black/30 outline-none ease-out duration-150 data-[state=closed]:duration-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:zoom-out-95 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent }
