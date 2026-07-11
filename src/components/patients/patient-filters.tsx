"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PatientFilters() {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => { const timer = setTimeout(() => { const next = new URLSearchParams(params.toString()); if (search) next.set("q", search); else next.delete("q"); next.delete("page"); router.replace(`${pathname}?${next.toString()}`); }, 250); return () => clearTimeout(timer); }, [search, pathname, params, router]);
  function setFilter(name: string, value: string) { const next = new URLSearchParams(params.toString()); if (value) next.set(name, value); else next.delete(name); next.delete("page"); router.replace(`${pathname}?${next.toString()}`); }
  return <div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar por nome ou CPF" /></div><div className="flex gap-2"><select value={params.get("gender") ?? ""} onChange={(event) => setFilter("gender", event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Todos os sexos</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select><Button variant="outline" size="default" onClick={() => router.replace(pathname)}><SlidersHorizontal /> Limpar</Button></div></div>;
}
