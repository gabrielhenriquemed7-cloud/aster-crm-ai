"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateContinuityItem } from "@/app/(dashboard)/continuidade/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id:string; title:string; description:string|null; item_type:string; priority:string; status:string; due_at:string|null; patient_id:string; appointment_id:string; patient:{full_name:string;cpf:string|null}|null };

export function ContinuityList({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = items.filter((item) => `${item.patient?.full_name} ${item.patient?.cpf} ${item.title} ${item.description}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  function act(id:string, action:"complete"|"cancel"|"reopen") {
    const reason = action === "complete" ? undefined : window.prompt(action === "cancel" ? "Motivo do cancelamento" : "Justificativa para reabrir")?.trim();
    if (action !== "complete" && !reason) return;
    startTransition(async () => { const result = await updateContinuityItem({ id, action, reason }); if (result.error) toast.error(result.error); else toast.success(result.success); });
  }
  return <div className="space-y-4">
    <Input aria-label="Buscar pendências" placeholder="Buscar por paciente, CPF, retorno, exame ou encaminhamento" value={query} onChange={(event)=>setQuery(event.target.value)} />
    {visible.length ? <div className="grid gap-3">{visible.map((item) => { const overdue = item.due_at && new Date(item.due_at) < new Date() && !["completed","cancelled","dismissed"].includes(item.status); return <article key={item.id} className="min-w-0 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="font-semibold">{item.title}</h2><p className="text-sm text-muted-foreground">{item.patient?.full_name ?? "Paciente"} · {item.item_type}</p></div><div className="flex gap-2"><Badge variant={overdue?"destructive":"outline"}>{overdue?"Prazo vencido":item.status}</Badge><Badge variant="secondary">{item.priority}</Badge></div></div>
      {item.description && <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" render={<Link href={`/patients/${item.patient_id}`} />} nativeButton={false}>Abrir paciente</Button><Button size="sm" variant="outline" render={<Link href={`/consultas/${item.appointment_id}/prontuario/visualizar`} />} nativeButton={false}>Abrir consulta</Button>{!["completed","cancelled"].includes(item.status)&&<><Button size="sm" disabled={pending} onClick={()=>act(item.id,"complete")}>Concluir</Button><Button size="sm" variant="outline" disabled={pending} onClick={()=>act(item.id,"cancel")}>Cancelar</Button></>}{["completed","cancelled"].includes(item.status)&&<Button size="sm" variant="outline" disabled={pending} onClick={()=>act(item.id,"reopen")}>Reabrir</Button>}</div>
    </article>})}</div>:<div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Nenhuma pendência encontrada.</div>}
  </div>;
}
