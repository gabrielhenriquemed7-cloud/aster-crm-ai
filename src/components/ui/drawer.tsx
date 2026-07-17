"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

const Drawer = DialogPrimitive.Root
const DrawerTrigger = DialogPrimitive.Trigger
const DrawerClose = DialogPrimitive.Close

function DrawerContent({ className, children, side = "right", ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }) {
  const sideClasses = { top: "inset-x-0 top-0 max-h-[90vh] border-b", right: "inset-y-0 right-0 h-full w-[min(28rem,90vw)] border-l", bottom: "inset-x-0 bottom-0 max-h-[90vh] border-t", left: "inset-y-0 left-0 h-full w-[min(28rem,90vw)] border-r" }
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" /><DialogPrimitive.Content data-slot="drawer-content" className={cn("fixed z-50 overflow-y-auto bg-background p-6 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out", sideClasses[side], className)} {...props}>{children}<DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"><X className="size-4" /><span className="sr-only">Fechar</span></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>
}
function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="drawer-header" className={cn("mb-4 space-y-1.5", className)} {...props} /> }
function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title data-slot="drawer-title" className={cn("text-lg font-semibold", className)} {...props} /> }
function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description data-slot="drawer-description" className={cn("text-sm text-muted-foreground", className)} {...props} /> }
function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="drawer-footer" className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} /> }

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger }
