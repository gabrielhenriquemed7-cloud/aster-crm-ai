"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appointmentStatusLabels } from "@/lib/appointments/types";

export function AppointmentFilters({ professionals }: { professionals: { id: string; full_name: string | null }[] }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams(); const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => { const timer = setTimeout(() => { const next = new URLSearchParams(params.toString()); if (search) next.set("q", search); else next.delete("q"); router.replace(`${pathname}?${next.toString()}`); }, 250); return () => clearTimeout(timer); }, [search, params, pathname, router]);
  function setFilter(name: string, value: string) { const next = new URLSearchParams(params.toString()); if (value) next.set(name, value); else next.delete(name); router.replace(`${pathname}?${next.toString()}`); }
  return <div className="flex flex-col gap-2 lg:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pelo nome do paciente" /></div><select className="h-9 rounded-md border bg-background px-3 text-sm" value={params.get("professional") ?? ""} onChange={(event) => setFilter("professional", event.target.value)}><option value="">Todos os profissionais</option>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.full_name || "Profissional"}</option>)}</select><select className="h-9 rounded-md border bg-background px-3 text-sm" value={params.get("status") ?? ""} onChange={(event) => setFilter("status", event.target.value)}><option value="">Todos os status</option>{Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="outline" onClick={() => router.replace(pathname)}><SlidersHorizontal /> Limpar</Button></div>;
}
