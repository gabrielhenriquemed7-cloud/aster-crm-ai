"use client";

import { AlertCircle, CalendarClock, CheckCircle2, ClipboardClock, FileClock, History, Loader2, Pencil, Printer, RefreshCw, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { startClinicalEncounter, updateAppointmentStatus } from "@/app/(dashboard)/appointments/actions";
import { confirmPatientArrival, sendPatientToWaitingRoom } from "@/app/(dashboard)/recepcao/actions";
import { QuickPatientDrawer } from "@/components/reception/quick-patient-drawer";
import { ReceptionPatientCard } from "@/components/reception/reception-patient-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { appointmentStatusLabels, type AppointmentStatus } from "@/lib/appointments/types";
import type { ReceptionPatient } from "@/lib/reception/types";

const groups: { status: AppointmentStatus; title: string }[] = [
  { status: "scheduled", title: "Agendados" }, { status: "confirmed", title: "Confirmados" },
  { status: "waiting", title: "Aguardando" }, { status: "in_progress", title: "Em atendimento" },
  { status: "completed", title: "Finalizados" }, { status: "no_show", title: "Faltaram" },
  { status: "cancelled", title: "Cancelados" },
];

function age(birthDate: string | null) {
  if (!birthDate) return "Não informada"; const birth = new Date(`${birthDate}T12:00:00`); const now = new Date();
  let value = now.getFullYear() - birth.getFullYear(); if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) value--; return `${value} anos`;
}
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value)) : "Não registrada"; }
function formatDateTime(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Não registrado"; }

export function ReceptionWorkspace({ initialPatients, loadError }: { initialPatients: ReceptionPatient[]; loadError: string | null }) {
  const router = useRouter(); const [query, setQuery] = useState(""); const [selectedId, setSelectedId] = useState(initialPatients[0]?.appointmentId ?? ""); const [refreshing, startRefresh] = useTransition();
  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase(); if (!term) return initialPatients; const digits = term.replace(/\D/g, ""); return initialPatients.filter((item) => [item.patient.fullName, item.patient.phone, item.patient.cpf, item.patient.insurance].some((value) => value?.toLocaleLowerCase().includes(term)) || Boolean(digits && [item.patient.phone, item.patient.cpf].some((value) => value?.replace(/\D/g, "").includes(digits)))); }, [initialPatients, query]);
  const selected = initialPatients.find((item) => item.appointmentId === selectedId) ?? filtered[0] ?? null;
  return <section className="space-y-5"><PageHeader><PageHeaderContent><PageHeaderTitle>Recepção</PageHeaderTitle><PageHeaderDescription>Gerenciamento de chegada dos pacientes</PageHeaderDescription></PageHeaderContent><PageHeaderActions><Button variant="outline" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar</Button><QuickPatientDrawer /></PageHeaderActions></PageHeader>
    {loadError && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="size-4" /> {loadError}</div>}
    <label className="relative block"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Pesquisar por nome, CPF, telefone ou convênio" aria-label="Pesquisar pacientes da recepção" /></label>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(280px,35fr)_minmax(0,65fr)]">
      <Card className="min-w-0 shadow-none"><CardHeader className="border-b py-4"><CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><ClipboardClock className="size-4 text-primary" /> Pacientes de hoje</span><Badge variant="outline">{filtered.length}</Badge></CardTitle></CardHeader><CardContent className="max-h-[calc(100vh-16rem)] space-y-5 overflow-y-auto p-3">{groups.map((group) => { const items = filtered.filter((item) => item.status === group.status); if (!items.length) return null; return <section key={group.status}><div className="mb-2 flex items-center justify-between px-1"><h2 className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{group.title}</h2><span className="text-xs tabular-nums text-muted-foreground">{items.length}</span></div><div className="space-y-2">{items.map((item) => <ReceptionPatientCard key={item.appointmentId} item={item} selected={selected?.appointmentId === item.appointmentId} onSelect={() => setSelectedId(item.appointmentId)} />)}</div></section>; })}{!filtered.length && <div className="py-14 text-center"><UserRound className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nenhum paciente encontrado</p><p className="mt-1 text-xs text-muted-foreground">Revise a pesquisa ou atualize a lista.</p></div>}</CardContent></Card>
      {selected ? <PatientDetails item={selected} /> : <Card className="grid min-h-96 place-items-center shadow-none"><div className="text-center"><UserRound className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-medium">Selecione um paciente</p><p className="text-sm text-muted-foreground">Os detalhes do atendimento aparecerão aqui.</p></div></Card>}
    </div>
  </section>;
}

function PatientDetails({ item }: { item: ReceptionPatient }) {
  const router = useRouter(); const [loading, setLoading] = useState(false); const [notes, setNotes] = useState(item.arrivalNotes ?? ""); const [reason, setReason] = useState(""); const [cancelOpen, setCancelOpen] = useState(false);
  async function advance(action: "checkin" | "waiting") { setLoading(true); const result = action === "checkin" ? await confirmPatientArrival(item.appointmentId, notes) : await sendPatientToWaitingRoom(item.appointmentId, notes); setLoading(false); if (result.error) return toast.error(result.error); toast.success(result.success); router.refresh(); }
  async function cancel() { setLoading(true); const result = await updateAppointmentStatus(item.appointmentId, "cancelled", reason); setLoading(false); if (result.error) return toast.error(result.error); toast.success(result.success); setCancelOpen(false); router.refresh(); }
  async function callPatient() { setLoading(true); const result = await startClinicalEncounter(item.appointmentId, crypto.randomUUID()); setLoading(false); if (result?.error) toast.error(result.error); }
  return <div className="min-w-0 space-y-4"><Card className="shadow-none"><CardContent className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><Avatar className="size-16"><AvatarImage src={item.patient.photoUrl ?? undefined} alt={`Foto de ${item.patient.fullName}`} /><AvatarFallback className="text-lg">{item.patient.fullName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-semibold">{item.patient.fullName}</h2><Badge variant={item.status === "cancelled" || item.status === "no_show" ? "destructive" : "secondary"}>{appointmentStatusLabels[item.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)} · {item.professionalName}</p></div></div>
      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Sexo" value={item.patient.gender} /><Detail label="Idade" value={age(item.patient.birthDate)} /><Detail label="Telefone" value={item.patient.phone} /><Detail label="Convênio" value={item.patient.insurance || "Particular"} /><Detail label="Carteirinha" value={item.patient.insuranceCard} /><Detail label="Última consulta" value={formatDate(item.lastAppointmentAt)} /><Detail label="Médico responsável" value={item.professionalName} /><Detail label="Check-in" value={formatDateTime(item.checkInAt)} /><Detail label="Responsável pelo check-in" value={item.checkedInByName} /></div></CardContent></Card>
    <Card className="shadow-none"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileClock className="size-4 text-primary" /> Informações do paciente</CardTitle></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2"><Info label="Observações" value={item.patient.notes || item.appointmentNotes} /><Info label="Histórico resumido" value={item.patient.medicalHistory} /></CardContent></Card>
    {(item.status === "scheduled" || item.status === "confirmed") && <Card className="border-primary/20 shadow-none"><CardHeader className="pb-3"><CardTitle className="text-base">Fluxo de chegada</CardTitle></CardHeader><CardContent><label className="text-sm font-medium" htmlFor="arrival-notes">Observações da chegada</label><Textarea id="arrival-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-20" maxLength={2000} placeholder="Documentos pendentes, confirmação cadastral ou observações administrativas" />{!item.checkInAt ? <Button className="mt-4 w-full sm:w-auto" size="lg" onClick={() => advance("checkin")} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar chegada</Button> : <Button className="mt-4 w-full sm:w-auto" size="lg" onClick={() => advance("waiting")} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <ClipboardClock />} Encaminhar para fila</Button>}</CardContent></Card>}
    {item.status === "waiting" && <Card className="border-primary/20 shadow-none"><CardHeader className="pb-3"><CardTitle className="text-base">Fila de espera</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Ao chamar, o contexto clínico será carregado e a consulta abrirá automaticamente.</p><Button className="mt-4" size="lg" onClick={callPatient} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <UserRound />} Chamar paciente</Button></CardContent></Card>}
    <Card className="shadow-none"><CardHeader className="pb-3"><CardTitle className="text-base">Ações</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" size="sm" render={<Link href={`/patients/${item.patientId}/edit`} />}><Pencil /> Editar cadastro</Button><Button variant="outline" size="sm" render={<Link href={`/appointments/${item.appointmentId}/edit`} />}><CalendarClock /> Remarcar</Button><Button variant="outline" size="sm" render={<Link href={`/patients/${item.patientId}`} />}><UserRound /> Visualizar paciente</Button><Button variant="outline" size="sm" render={<Link href={`/patients/${item.patientId}/longitudinal`} />}><History /> Abrir histórico</Button><Button variant="outline" size="sm" onClick={() => toast.info("Impressão da ficha será disponibilizada em uma próxima etapa.")}><Printer /> Imprimir ficha</Button>{["scheduled", "confirmed"].includes(item.status) && <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogTrigger asChild><Button variant="destructive" size="sm"><X /> Cancelar consulta</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Cancelar consulta?</DialogTitle><DialogDescription>O motivo ficará registrado na Agenda.</DialogDescription></DialogHeader><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo do cancelamento" /><DialogFooter><DialogClose asChild><Button variant="outline">Voltar</Button></DialogClose><Button variant="destructive" onClick={cancel} disabled={loading || !reason.trim()}>Confirmar cancelamento</Button></DialogFooter></DialogContent></Dialog>}</CardContent></Card>
  </div>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm">{value || "Não informado"}</p></div>; }
function Info({ label, value }: { label: string; value: string | null | undefined }) { return <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{value || "Nenhuma informação registrada."}</p></div>; }
