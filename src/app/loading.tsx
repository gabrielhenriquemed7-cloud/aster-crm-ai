import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main className="min-h-dvh bg-background p-4 sm:p-6"><div className="mx-auto max-w-[1600px] space-y-6"><div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-80 max-w-full" /></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div><LoadingState label="Carregando ASTER CRM AI…" className="border-0" /></div></main>;
}
