import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

function Select({ className, children, controlSize = "md", ...props }: React.ComponentProps<"select"> & { controlSize?: "sm" | "md" | "lg" }) {
  return <div data-slot="select-wrapper" className="relative w-full"><select data-slot="select" data-size={controlSize} className={cn("h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-8 data-[size=sm]:px-2.5 data-[size=sm]:pr-8 data-[size=sm]:text-xs data-[size=lg]:h-10 data-[size=lg]:px-3.5 data-[size=lg]:pr-10 aria-invalid:border-error aria-invalid:ring-3 aria-invalid:ring-error/20", className)} {...props}>{children}</select><ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" /></div>
}

export { Select }
