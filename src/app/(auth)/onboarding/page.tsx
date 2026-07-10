"use client";

import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createInitialClinic } from "@/app/(auth)/onboarding/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OnboardingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", legalName: "", cnpj: "", email: "", phone: "" });
  function update(name: keyof typeof form, value: string) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await createInitialClinic(form);
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    router.replace("/dashboard");
    router.refresh();
  }
  return <AuthShell title="Crie sua clínica" description="Você será o administrador inicial e poderá convidar sua equipe depois."><form onSubmit={submit} className="space-y-3"><div><label className="mb-1.5 block text-sm font-medium" htmlFor="clinic-name">Nome da clínica *</label><Input id="clinic-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Clínica Aster" required /></div><div><label className="mb-1.5 block text-sm font-medium" htmlFor="legal-name">Nome jurídico</label><Input id="legal-name" value={form.legalName} onChange={(event) => update("legalName", event.target.value)} placeholder="Opcional" /></div><div><label className="mb-1.5 block text-sm font-medium" htmlFor="cnpj">CNPJ</label><Input id="cnpj" value={form.cnpj} onChange={(event) => update("cnpj", event.target.value)} placeholder="Opcional" /></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium" htmlFor="clinic-email">E-mail</label><Input id="clinic-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="Opcional" /></div><div><label className="mb-1.5 block text-sm font-medium" htmlFor="clinic-phone">Telefone</label><Input id="clinic-phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Opcional" /></div></div><Button type="submit" className="mt-2 w-full cursor-pointer" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Building2 />}Criar clínica</Button></form></AuthShell>;
}
