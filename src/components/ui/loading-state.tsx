import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

function LoadingState({ label = "Carregando...", className, ...props }: React.ComponentProps<"div"> & { label?: string }) { return <div data-slot="loading-state" role="status" aria-live="polite" className={cn("flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground", className)} {...props}><Loader2 className="size-4 animate-spin" /><span>{label}</span></div> }
export { LoadingState }
