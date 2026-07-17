import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

function ErrorState({ title = "Não foi possível carregar", description, action, className, ...props }: React.ComponentProps<"div"> & { title?: string; description?: string; action?: React.ReactNode }) { return <div data-slot="error-state" role="alert" className={cn("flex min-h-40 flex-col items-center justify-center rounded-xl border border-error/30 bg-error/5 p-6 text-center", className)} {...props}><AlertCircle className="size-8 text-error" /><h3 className="mt-3 font-semibold">{title}</h3>{description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}{action && <div className="mt-4">{action}</div>}</div> }
export { ErrorState }
