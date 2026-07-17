import * as React from "react"
import { cn } from "@/lib/utils"

function SectionHeader({ className, ...props }: React.ComponentProps<"header">) { return <header data-slot="section-header" className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)} {...props} /> }
function SectionHeaderContent({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="section-header-content" className={cn("min-w-0", className)} {...props} /> }
function SectionHeaderTitle({ className, ...props }: React.ComponentProps<"h2">) { return <h2 data-slot="section-header-title" className={cn("text-lg font-semibold tracking-tight", className)} {...props} /> }
function SectionHeaderDescription({ className, ...props }: React.ComponentProps<"p">) { return <p data-slot="section-header-description" className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} /> }
function SectionHeaderActions({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="section-header-actions" className={cn("flex shrink-0 flex-wrap items-center gap-2", className)} {...props} /> }

export { SectionHeader, SectionHeaderActions, SectionHeaderContent, SectionHeaderDescription, SectionHeaderTitle }
