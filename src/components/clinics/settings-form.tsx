"use client";

import { CheckCircle2, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { saveSettings } from "@/app/(dashboard)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "time" | "checkbox";
};
export function SettingsForm({
  kind,
  initial,
  fields,
}: {
  kind: "document_settings" | "schedule_settings" | "ai_settings";
  initial: Record<string, unknown>;
  fields: Field[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.type === "checkbox"
          ? Boolean(initial[field.key])
          : String(initial[field.key] ?? ""),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await saveSettings(kind, values);
      if ("error" in result) {
        const message = result.error ?? "SEM_CODIGO: Não foi possível salvar.";
        setError(message);
        toast.error(message);
        return;
      }
      const message = result.success ?? "Configurações salvas com sucesso";
      setSuccess(message);
      toast.success(message);
      router.refresh();
    } catch (cause) {
      const message = `SEM_CODIGO: ${cause instanceof Error ? cause.message : "Não foi possível salvar."}`;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2"
    >
      {fields.map((field) =>
        field.type === "checkbox" ? (
          <label key={field.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(values[field.key])}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: event.target.checked,
                }))
              }
            />
            {field.label}
          </label>
        ) : (
          <label key={field.key}>
            <span className="text-sm font-medium">{field.label}</span>
            <Input
              className="mt-1"
              type={field.type ?? "text"}
              value={String(values[field.key] ?? "")}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
            />
          </label>
        ),
      )}
      {error && (
        <p
          role="alert"
          className="sm:col-span-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 sm:col-span-2 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-4" />
          {success}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Salvando..." : "Salvar configuração"}
        </Button>
      </div>
    </form>
  );
}
