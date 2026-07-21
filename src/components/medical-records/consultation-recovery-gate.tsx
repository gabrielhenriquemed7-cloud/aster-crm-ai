"use client";
import { CalendarPlus, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { startClinicalEncounter } from "@/app/(dashboard)/appointments/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConsultationRecoveryGate({ appointmentId, patientId, professionalId }: { appointmentId: string; patientId: string; professionalId: string }) {
  const [loading, setLoading] = useState(false);
  async function resume() { setLoading(true); const result = await startClinicalEncounter(appointmentId, crypto.randomUUID()); setLoading(false); if (result?.error) toast.error(result.error); }
  return <Card className="mx-auto max-w-xl shadow-none"><CardHeader><CardTitle>Consulta em aberto</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Este atendimento permaneceu aberto. Escolha como prosseguir; nenhuma consulta será duplicada automaticamente.</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={resume} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RotateCcw />} Continuar consulta</Button><Button variant="outline" render={<Link href={`/appointments/new?patient=${patientId}&professional=${professionalId}`} />}><CalendarPlus /> Criar nova consulta</Button></div></CardContent></Card>;
}
