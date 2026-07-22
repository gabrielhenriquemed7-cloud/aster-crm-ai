"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { acceptClinicInvite } from "@/app/(auth)/auth/accept-invite/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Invite = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  clinics: { name: string } | { name: string }[] | null;
};

export function AcceptInviteForm({
  invite,
  initialError,
}: {
  invite: Invite | null;
  initialError: string | null;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const clinic = Array.isArray(invite?.clinics)
    ? invite?.clinics[0]?.name
    : invite?.clinics?.name;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!invite) return;
    if (password.length < 8)
      return toast.error("A senha deve ter ao menos 8 caracteres.");
    if (password !== confirmation)
      return toast.error("As senhas não coincidem.");
    setSaving(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setSaving(false);
      return toast.error(
        "Não foi possível definir a senha. Abra novamente o link do convite.",
      );
    }
    const result = await acceptClinicInvite(invite.id);
    setSaving(false);
    if (result?.error) toast.error(result.error);
  }
  if (initialError || !invite)
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
      >
        {initialError || "Convite indisponível."}
      </p>
    );
  return (
    <form onSubmit={submit} className="min-w-0 space-y-4">
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium break-words">
          {invite.full_name || invite.email}
        </p>
        <p className="break-all text-muted-foreground">{invite.email}</p>
        <p className="mt-2">Clínica: {clinic || "Clínica convidante"}</p>
      </div>
      <label className="block text-sm font-medium">
        Nova senha
        <Input
          className="mt-1"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        Confirmar senha
        <Input
          className="mt-1"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </label>
      <Button className="w-full" type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}Aceitar convite e
        acessar o ASTER
      </Button>
    </form>
  );
}
