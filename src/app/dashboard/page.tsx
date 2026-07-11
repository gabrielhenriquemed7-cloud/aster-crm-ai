import { CalendarDays, Plus, UsersRound } from "lucide-react";
import Link from "next/link";

import { getTodayAppointmentMetrics } from "@/app/(dashboard)/appointments/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const metrics = await getTodayAppointmentMetrics();
  return <section>
    <div className="flex flex-col gap-4 rounded-[2rem] border border-border bg-background/95 p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm text-muted-foreground">Versão preliminar</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-foreground">Sua clínica, organizada.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Comece cadastrando pacientes e agendando consultas. Os dados exibidos aqui serão sempre os registros da sua clínica ativa.</p></div>
      <Button render={<Link href="/patients/new" />} size="lg" variant="secondary" className="cursor-pointer"><Plus /> Novo paciente</Button>
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="size-5 text-primary" /> Pacientes</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">Ainda não há indicadores para exibir. Cadastre o primeiro paciente para iniciar a operação.</p><Button render={<Link href="/patients/new" />} variant="outline" className="mt-4 cursor-pointer">Cadastrar paciente</Button></CardContent></Card>
      <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" /> Consultas hoje</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold tracking-tight">{metrics.total}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{metrics.awaitingConfirmation} aguardando confirmação</p>{metrics.error && <p className="mt-2 text-xs text-destructive">{metrics.error}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button render={<Link href="/appointments?view=day" />} variant="outline">Abrir agenda</Button><Button render={<Link href="/appointments/new" />} variant="secondary">Agendar consulta</Button></div></CardContent></Card>
    </div>
  </section>;
}
