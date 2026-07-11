"use client";

import { Check, CirclePlay, Clock3, Loader2, UserCheck, UserX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateAppointmentStatus } from "@/app/(dashboard)/appointments/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AppointmentStatus } from "@/lib/appointments/types";

export function AppointmentActions({ id, status }: { id: string; status: AppointmentStatus }) {
  const router = useRouter(); const [loading, setLoading] = useState<AppointmentStatus | null>(null); const [cancelOpen, setCancelOpen] = useState(false); const [reason, setReason] = useState("");
  async function change(next: AppointmentStatus, cancellationReason = "") { setLoading(next); const result = await updateAppointmentStatus(id, next, cancellationReason); setLoading(null); if (result.error) return toast.error(result.error); toast.success(result.success); setCancelOpen(false); router.refresh(); }
  const actions: { status: AppointmentStatus; label: string; icon: typeof Check }[] = [
    { status: "confirmed", label: "Confirmar", icon: Check }, { status: "waiting", label: "Marcar chegada", icon: Clock3 },
    { status: "in_progress", label: "Iniciar", icon: CirclePlay }, { status: "completed", label: "Finalizar", icon: UserCheck }, { status: "no_show", label: "Registrar falta", icon: UserX },
  ];
  return <div className="flex flex-wrap gap-2">{actions.filter((item) => item.status !== status).map((item) => <Button key={item.status} variant="outline" size="sm" disabled={Boolean(loading) || status === "cancelled" || status === "completed"} onClick={() => change(item.status)}>{loading === item.status ? <Loader2 className="animate-spin" /> : <item.icon />}{item.label}</Button>)}
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogTrigger asChild><Button variant="destructive" size="sm" disabled={Boolean(loading) || status === "cancelled" || status === "completed"}><X /> Cancelar</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Cancelar consulta?</DialogTitle><DialogDescription>Informe o motivo. O cancelamento ficará registrado no histórico.</DialogDescription></DialogHeader><textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Motivo do cancelamento" /><DialogFooter><DialogClose asChild><Button variant="outline">Voltar</Button></DialogClose><Button variant="destructive" disabled={!reason.trim() || loading === "cancelled"} onClick={() => change("cancelled", reason)}>{loading === "cancelled" && <Loader2 className="animate-spin" />} Confirmar cancelamento</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
