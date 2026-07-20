"use client";

import {
  CalendarPlus,
  Check,
  CirclePlay,
  Clock3,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Printer,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  startClinicalEncounter,
  updateAppointmentStatus,
} from "@/app/(dashboard)/appointments/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AppointmentStatus } from "@/lib/appointments/types";

export function AppointmentActions({
  id,
  status,
  patientId,
  professionalId,
}: {
  id: string;
  status: AppointmentStatus;
  patientId: string;
  professionalId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  async function change(next: AppointmentStatus, cancellationReason = "") {
    setLoading(next);
    const result = await updateAppointmentStatus(id, next, cancellationReason);
    setLoading(null);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    setCancelOpen(false);
    router.refresh();
  }
  async function start() {
    setLoading("start");
    const result = await startClinicalEncounter(id);
    setLoading(null);
    if (result?.error) toast.error(result.error);
  }
  const reschedule = (
    <Button
      variant="outline"
      size="sm"
      render={<Link href={`/appointments/${id}/edit`} />}
    >
      <Pencil /> Reagendar
    </Button>
  );
  const cancel = (
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <X /> Cancelar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar consulta?</DialogTitle>
          <DialogDescription>
            Informe o motivo. O cancelamento ficará registrado.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Motivo do cancelamento"
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Voltar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!reason.trim() || loading === "cancelled"}
            onClick={() => change("cancelled", reason)}
          >
            {loading === "cancelled" && <Loader2 className="animate-spin" />}{" "}
            Confirmar cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {status === "scheduled" && (
        <>
          <Button
            size="sm"
            onClick={() => change("confirmed")}
            disabled={Boolean(loading)}
          >
            {loading === "confirmed" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Check />
            )}{" "}
            Confirmar
          </Button>
          {cancel}
          {reschedule}
        </>
      )}
      {status === "confirmed" && (
        <>
          <Button
            size="sm"
            onClick={() => change("waiting")}
            disabled={Boolean(loading)}
          >
            {loading === "waiting" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Clock3 />
            )}{" "}
            Registrar chegada
          </Button>
          {cancel}
          {reschedule}
        </>
      )}
      {status === "waiting" && (
        <Button size="sm" onClick={start} disabled={Boolean(loading)}>
          {loading === "start" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <CirclePlay />
          )}{" "}
          Iniciar atendimento
        </Button>
      )}
      {status === "in_progress" && (
        <Button
          size="sm"
          render={<Link href={`/consultas/${id}/prontuario`} />}
        >
          <CirclePlay /> Continuar atendimento
        </Button>
      )}
      {status === "completed" && (
        <>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/consultas/${id}/prontuario`} />}
          >
            <FileText /> Ver prontuário
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/consultas/${id}/prontuario/visualizar`} />}
          >
            <Eye /> Visualizar
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={<a href={`/api/medical-records/${id}/pdf`} download />}
          >
            <Download /> Gerar PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/consultas/${id}/prontuario/visualizar`} />}
          >
            <Printer /> Imprimir
          </Button>
          <Button
            size="sm"
            render={
              <Link
                href={`/appointments/new?patient=${patientId}&professional=${professionalId}&type=return`}
              />
            }
          >
            <CalendarPlus /> Agendar retorno
          </Button>
        </>
      )}
      {status === "no_show" && reschedule}
      {status === "cancelled" && reschedule}
    </div>
  );
}
