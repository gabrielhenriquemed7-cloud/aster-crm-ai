import * as React from "react"
import { Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

function EmptyState({ icon, title, description, action, className, ...props }: React.ComponentProps<"div"> & { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return <div data-slot="empty-state" className={cn("flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 p-6 text-center", className)} {...props}><div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon ?? <Inbox className="size-5" />}</div><h3 className="font-semibold">{title}</h3>{description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>
}

export { EmptyState }
