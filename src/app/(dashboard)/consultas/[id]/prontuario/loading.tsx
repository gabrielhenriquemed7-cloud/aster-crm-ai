import { Skeleton } from "@/components/ui/skeleton";

export default function MedicalRecordLoading() {
  return <div className="space-y-3" aria-label="Carregando workspace clínico"><div className="rounded-lg border p-3"><div className="flex items-center gap-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-4 w-48" /><Skeleton className="ml-auto h-4 w-28" /></div><Skeleton className="mt-4 h-9 w-full" /><div className="mt-3 grid gap-3 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-3 rounded-lg border p-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-2/3" /></div>)}</div></div><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
}
