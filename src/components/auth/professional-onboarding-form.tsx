"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { completeProfessionalOnboarding } from "@/app/(auth)/auth/professional-onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Invite = {
  full_name: string | null;
  email: string;
  role: string;
  metadata: Record<string, string | null>;
  clinics: { name: string } | { name: string }[] | null;
};
export function ProfessionalOnboardingForm({
  invitationId,
  invite,
  initialError,
}: {
  invitationId: string;
  invite: Invite | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const meta = invite?.metadata ?? {};
  const [values, setValues] = useState({
    full_name: invite?.full_name ?? "",
    phone: meta.phone ?? "",
    specialty: meta.specialty ?? "",
    council: meta.council ?? "",
    council_number: meta.council_number ?? "",
    council_state: meta.council_state ?? "",
    photo_url: "",
    signature_url: "",
    termsAccepted: false,
  });
  const [saving, setSaving] = useState(false);
  const clinic = Array.isArray(invite?.clinics)
    ? invite?.clinics[0]?.name
    : invite?.clinics?.name;
  const update = (key: keyof typeof values, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await completeProfessionalOnboarding(invitationId, values);
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    router.replace(result.destination!);
    router.refresh();
  }
  if (initialError || !invite)
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
      >
        {initialError || "Onboarding indisponível."}
      </p>
    );
  return (
    <form onSubmit={submit} className="min-w-0 space-y-4">
      <div className="rounded-lg border bg-muted/20 p-4 text-sm">
        <p className="font-semibold">Bem-vindo ao ASTER</p>
        <p className="mt-1 break-words text-muted-foreground">
          {clinic} · {invite.role}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nome completo *"
          value={values.full_name}
          onChange={(value) => update("full_name", value)}
          required
        />
        <Field
          label="Telefone"
          value={values.phone}
          onChange={(value) => update("phone", value)}
        />
        <Field
          label="Especialidade"
          value={values.specialty}
          onChange={(value) => update("specialty", value)}
        />
        <Field
          label="Conselho"
          value={values.council}
          onChange={(value) => update("council", value)}
        />
        <Field
          label="Número do conselho"
          value={values.council_number}
          onChange={(value) => update("council_number", value)}
        />
        <Field
          label="UF"
          value={values.council_state}
          onChange={(value) =>
            update("council_state", value.toUpperCase().slice(0, 2))
          }
        />
      </div>
      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Foto e assinatura (opcionais)
        </summary>
        <div className="mt-3 space-y-3">
          <Field
            label="URL da foto"
            type="url"
            value={values.photo_url}
            onChange={(value) => update("photo_url", value)}
          />
          <Field
            label="URL da assinatura digitalizada"
            type="url"
            value={values.signature_url}
            onChange={(value) => update("signature_url", value)}
          />
          <p className="text-xs text-muted-foreground">
            A assinatura é apenas uma imagem de apoio documental e não constitui
            assinatura digital com valor jurídico.
          </p>
        </div>
      </details>
      <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          checked={values.termsAccepted}
          onChange={(event) => update("termsAccepted", event.target.checked)}
          required
        />
        <span>
          Li e aceito os Termos de Uso e a Política de Privacidade
          institucionais vigentes.
        </span>
      </label>
      <Button className="w-full" type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {saving ? "Concluindo..." : "Entrar no ASTER"}
      </Button>
    </form>
  );
}
function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <Input
        className="mt-1"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}
