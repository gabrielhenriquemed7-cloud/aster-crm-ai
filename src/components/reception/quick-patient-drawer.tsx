"use client";

import { Loader2, Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createPatient } from "@/app/(dashboard)/patients/actions";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { maskCpf, maskPhone } from "@/lib/patients/format";
import { patientDefaultValues, type PatientFormValues } from "@/lib/patients/schema";

const initial = { full_name: "", birth_date: "", phone: "", cpf: "", gender: "", insurance: "" };

export function QuickPatientDrawer() {
  const router = useRouter(); const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(initial); const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  function update(name: keyof typeof initial, value: string) { setValues((current) => ({ ...current, [name]: value })); }
  async function save() {
    setSaving(true);
    const payload: PatientFormValues = { ...patientDefaultValues, ...values };
    const result = await createPatient(payload); setSaving(false);
    if (result.error || !result.id) return toast.error(result.error || "Não foi possível cadastrar o paciente.");
    setCreated({ id: result.id, name: values.full_name }); toast.success("Paciente cadastrado com sucesso."); router.refresh();
  }
  return <Drawer open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setValues(initial); setCreated(null); } }}><DrawerTrigger asChild><Button><UserPlus /> Novo Paciente</Button></DrawerTrigger><DrawerContent><DrawerHeader><DrawerTitle>Cadastro rápido</DrawerTitle><DrawerDescription>Cadastre os dados mínimos e agende o atendimento em seguida.</DrawerDescription></DrawerHeader>
    {created ? <div className="rounded-xl border bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"><p className="font-semibold">Cadastro concluído</p><p className="mt-1 text-sm">{created.name} já pode ser agendado.</p><Button className="mt-5 w-full" onClick={() => router.push(`/appointments/new?patient=${created.id}`)}><Plus /> Agendar agora</Button><Button variant="outline" className="mt-2 w-full" onClick={() => { setCreated(null); setValues(initial); }}>Cadastrar outro</Button></div> : <div className="space-y-4">
      <Field label="Nome *"><Input value={values.full_name} onChange={(event) => update("full_name", event.target.value)} placeholder="Nome completo" autoFocus /></Field>
      <Field label="Nascimento"><Input type="date" value={values.birth_date} onChange={(event) => update("birth_date", event.target.value)} /></Field>
      <Field label="Telefone"><Input value={values.phone} onChange={(event) => update("phone", maskPhone(event.target.value))} placeholder="(00) 00000-0000" /></Field>
      <Field label="CPF"><Input value={values.cpf} onChange={(event) => update("cpf", maskCpf(event.target.value))} placeholder="000.000.000-00" /></Field>
      <Field label="Sexo"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={values.gender} onChange={(event) => update("gender", event.target.value)}><option value="">Selecione</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Outro">Outro</option><option value="Não informado">Prefere não informar</option></select></Field>
      <Field label="Convênio"><Input value={values.insurance} onChange={(event) => update("insurance", event.target.value)} placeholder="Particular ou nome do plano" /></Field>
    </div>}
    {!created && <DrawerFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving || values.full_name.trim().length < 3}>{saving && <Loader2 className="animate-spin" />} Salvar</Button></DrawerFooter>}
  </DrawerContent></Drawer>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>; }
