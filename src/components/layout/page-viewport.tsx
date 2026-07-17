"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function PageViewport({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname()
  return <main id="main-content" className={cn("box-border w-full flex-1 overflow-x-hidden", className)}><div key={pathname} className="aster-page-enter mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</div></main>
}
