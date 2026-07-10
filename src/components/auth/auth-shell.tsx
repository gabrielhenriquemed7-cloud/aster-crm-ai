import type { ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function AuthShell({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10"><section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8"><Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-[#0b1f3a] text-white"><Sparkles className="size-4" /></span>ASTER CRM AI <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Versão preliminar</span></Link><h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><div className="mt-7">{children}</div></section></main>;
}
