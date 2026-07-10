"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function AppointmentFilters({ doctors }: { doctors: { id: string; full_name: string | null }[] }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams(); const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => { const timer = setTimeout(() => { const next = new URLSearchParams(params.toString()); if (search) next.set("q", search); else next.delete("q"); router.replace(`${pathname}?${next.toString()}`); }, 250); return () => clearTimeout(timer); }, [search, params, pathname, router]);
  function selectDoctor(value: string) { const next = new URLSearchParams(params.toString()); if (value) next.set("doctor", value); else next.delete("doctor"); router.replace(`${pathname}?${next.toString()}`); }
  return <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paciente" aria-label="Buscar paciente" /></div><select className="h-9 rounded-md border bg-background px-3 text-sm" value={params.get("doctor") ?? ""} onChange={(event) => selectDoctor(event.target.value)} aria-label="Filtrar por médico"><option value="">Todos os médicos</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name || "Profissional"}</option>)}</select></div>;
}
