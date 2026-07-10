"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const roleLabels: Record<string, string> = { administrator: "Administrador", doctor: "Médico", secretary: "Secretária", receptionist: "Recepcionista" };

export function ProfileForm() {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState("receptionist"); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { const supabase = createClient(); void (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; setEmail(user.email ?? ""); const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(); setName(data?.full_name ?? user.user_metadata.full_name ?? ""); setRole(data?.role ?? "receptionist"); setLoading(false); })(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); const { error } = user ? await supabase.from("profiles").update({ full_name: name }).eq("id", user.id) : { error: new Error("Sessão inválida") }; setSaving(false); if (error) return toast.error("Não foi possível atualizar o perfil."); toast.success("Perfil atualizado com sucesso."); }
  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  return <form onSubmit={save} className="max-w-xl space-y-4 rounded-xl border bg-card p-5 shadow-none"><div><label className="mb-1.5 block text-sm font-medium">Nome completo</label><Input value={name} onChange={(event) => setName(event.target.value)} required /></div><div><label className="mb-1.5 block text-sm font-medium">E-mail</label><Input value={email} disabled /></div><div><label className="mb-1.5 block text-sm font-medium">Perfil</label><Input value={roleLabels[role] ?? role} disabled /></div><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}Salvar alterações</Button></form>;
}
