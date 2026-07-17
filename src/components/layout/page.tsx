import * as React from "react"
import { cn } from "@/lib/utils"

function Page({ className, ...props }: React.ComponentProps<"section">) { return <section data-slot="page" className={cn("space-y-6", className)} {...props} /> }
function PageContent({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="page-content" className={cn("min-w-0 space-y-6", className)} {...props} /> }
function PageGrid({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="page-grid" className={cn("grid min-w-0 gap-4 sm:gap-5 lg:gap-6", className)} {...props} /> }

export { Page, PageContent, PageGrid }
