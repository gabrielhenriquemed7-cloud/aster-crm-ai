"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveSettings } from "@/app/(dashboard)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = { key: string; label: string; type?: "text" | "number" | "time" | "checkbox" };
export function SettingsForm({ kind, initial, fields }: { kind: "clinic_settings" | "document_settings" | "schedule_settings" | "ai_settings"; initial: Record<string, unknown>; fields: Field[] }) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((field) => [field.key, field.type === "checkbox" ? Boolean(initial[field.key]) : String(initial[field.key] ?? "")] )));
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); const result = await saveSettings(kind, values); setSaving(false); if (result.error) return toast.error(result.error); toast.success(result.success); }
  return <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">{fields.map((field) => field.type === "checkbox" ? <label key={field.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))} />{field.label}</label> : <label key={field.key}><span className="text-sm font-medium">{field.label}</span><Input className="mt-1" type={field.type ?? "text"} value={String(values[field.key] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}<div className="sm:col-span-2"><Button disabled={saving}>{saving && <Loader2 className="animate-spin" />}<Save />Salvar configuração</Button></div></form>;
}
