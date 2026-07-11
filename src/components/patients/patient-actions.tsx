"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { deletePatient } from "@/app/(dashboard)/patients/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function PatientActions({ id, name }: { id: string; name: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  async function remove() { setLoading(true); const result = await deletePatient(id); setLoading(false); if (result.error) return toast.error(result.error); toast.success(result.success); setOpen(false); router.refresh(); }
  return <Dialog open={open} onOpenChange={setOpen}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Ações para ${name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/patients/${id}/edit`}><Pencil /> Editar</Link></DropdownMenuItem><DialogTrigger asChild><DropdownMenuItem variant="destructive"><Trash2 /> Excluir</DropdownMenuItem></DialogTrigger></DropdownMenuContent></DropdownMenu><DialogContent><DialogHeader><DialogTitle>Excluir paciente?</DialogTitle><DialogDescription>O cadastro de {name} será removido das telas, mas permanecerá preservado para auditoria.</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button variant="destructive" onClick={remove} disabled={loading}>{loading ? "Excluindo..." : "Excluir paciente"}</Button></DialogFooter></DialogContent></Dialog>;
}
