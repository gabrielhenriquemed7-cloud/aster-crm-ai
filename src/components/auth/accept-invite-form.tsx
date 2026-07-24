"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { acceptClinicInvite } from "@/app/(auth)/auth/accept-invite/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  requiresPassword,
}: {
  invite: Invite | null;
  initialError: string | null;
  requiresPassword: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const clinic = Array.isArray(invite?.clinics)
    ? invite?.clinics[0]?.name
    : invite?.clinics?.name;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!invite) return;
    if (requiresPassword) {
      if (
        password.length < 8 ||
        !/[A-Za-z]/.test(password) ||
        !/\d/.test(password)
      )
        return toast.error(
          "A senha deve ter ao menos 8 caracteres, uma letra e um número.",
        );
      if (password !== confirmation)
        return toast.error("As senhas não coincidem.");
    }
    setSaving(true);
    const result = await acceptClinicInvite(
      invite.id,
      requiresPassword ? password : undefined,
    );
    setSaving(false);
    if (result?.error) toast.error(result.error);
  }
  if (initialError || !invite)
    return (
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive"
        >
          {initialError || "Convite indisponível."}
        </p>
        <Link
          className={buttonVariants({
            variant: "outline",
            className: "w-full",
          })}
          href="/login"
        >
          Voltar ao login
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="min-w-0 space-y-4">
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium break-words">
          {invite.full_name || invite.email}
        </p>
        <p className="break-all text-muted-foreground">{invite.email}</p>
        <p className="mt-2">Clínica: {clinic || "Clínica convidante"}</p>
        <p className="mt-1">Função: {invite.role}</p>
      </div>
      {requiresPassword ? (
        <>
          <label className="block text-sm font-medium">
            Nova senha
            <Input
              className="mt-1"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Confirmar nova senha
            <Input
              className="mt-1"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />{" "}
            Mostrar senha
          </label>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className={password.length >= 8 ? "text-emerald-700" : ""}>
              ✓ Pelo menos 8 caracteres
            </li>
            <li className={/[A-Za-z]/.test(password) ? "text-emerald-700" : ""}>
              ✓ Pelo menos uma letra
            </li>
            <li className={/\d/.test(password) ? "text-emerald-700" : ""}>
              ✓ Pelo menos um número
            </li>
            <li
              className={
                Boolean(password) && password === confirmation
                  ? "text-emerald-700"
                  : ""
              }
            >
              ✓ Senhas coincidentes
            </li>
          </ul>
        </>
      ) : (
        <p className="rounded-xl border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
          Sua conta já existe. Confirme sua entrada na clínica sem alterar sua
          senha atual.
        </p>
      )}
      <Button className="w-full" type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {saving ? "Finalizando..." : "FINALIZAR CADASTRO"}
      </Button>
    </form>
  );
}
