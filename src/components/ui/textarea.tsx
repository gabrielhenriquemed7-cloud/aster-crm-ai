import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, controlSize = "md", ...props }: React.ComponentProps<"textarea"> & { controlSize?: "sm" | "md" | "lg" }) {
  return <textarea data-slot="textarea" data-size={controlSize} className={cn("min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:min-h-20 data-[size=sm]:px-2.5 data-[size=sm]:py-1.5 data-[size=sm]:text-xs data-[size=lg]:min-h-32 data-[size=lg]:px-3.5 data-[size=lg]:py-2.5 aria-invalid:border-error aria-invalid:ring-3 aria-invalid:ring-error/20 md:text-sm dark:bg-input/30", className)} {...props} />
}

export { Textarea }
