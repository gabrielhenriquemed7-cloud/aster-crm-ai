import * as React from "react"
import { cn } from "@/lib/utils"

function PageHeader({ className, ...props }: React.ComponentProps<"header">) { return <header data-slot="page-header" className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)} {...props} /> }
function PageHeaderContent({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="page-header-content" className={cn("min-w-0 space-y-1", className)} {...props} /> }
function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) { return <h1 data-slot="page-header-title" className={cn("text-2xl font-semibold tracking-[-0.03em] sm:text-3xl", className)} {...props} /> }
function PageHeaderDescription({ className, ...props }: React.ComponentProps<"p">) { return <p data-slot="page-header-description" className={cn("text-sm text-muted-foreground", className)} {...props} /> }
function PageHeaderActions({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="page-header-actions" className={cn("flex shrink-0 flex-wrap items-center gap-2", className)} {...props} /> }

export { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle }
