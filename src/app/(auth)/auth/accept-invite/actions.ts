"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Za-z]/)
  .regex(/[0-9]/);

export async function getPendingInvite() {
  const supabase = await createClient();
  if (!supabase)
    return {
      invite: null,
      error: "Serviço indisponível.",
      requiresPassword: false,
    };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email)
    return {
      invite: null,
      error: "Sua sessão expirou. Abra novamente o link recebido por e-mail.",
      requiresPassword: false,
    };
  const { data, error } = await supabase
    .from("clinic_invites")
    .select(
      "id, full_name, email, role, status, expires_at, auth_user_id, onboarding_completed_at, clinics(name)",
    )
    .eq("email", auth.user.email.toLowerCase())
    .in("status", [
      "pending",
      "sent",
      "accepted",
      "expired",
      "cancelled",
      "revoked",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data)
    return {
      invite: null,
      error: "Não foi possível validar este convite.",
      requiresPassword: false,
    };
  if (["cancelled", "revoked"].includes(data.status))
    return {
      invite: data,
      error: "Não foi possível validar este convite.",
      requiresPassword: false,
    };
  if (
    data.status === "expired" ||
    new Date(data.expires_at).getTime() <= Date.now()
  )
    return {
      invite: data,
      error:
        "Este convite expirou. Solicite um novo convite ao administrador da clínica.",
      requiresPassword: false,
    };
  if (data.status === "accepted" && data.onboarding_completed_at)
    return {
      invite: data,
      error:
        "Este convite já foi utilizado. Entre com sua conta para continuar.",
      requiresPassword: false,
    };
  if (data.status === "accepted" && data.auth_user_id !== auth.user.id)
    return {
      invite: data,
      error: "Este convite foi enviado para outro endereço de e-mail.",
      requiresPassword: false,
    };

  const invitationId = auth.user.user_metadata?.invitation_id;
  return {
    invite: data,
    error: null,
    requiresPassword: data.status !== "accepted" && invitationId === data.id,
  };
}

export async function acceptClinicInvite(inviteId: string, password?: string) {
  const parsed = idSchema.safeParse(inviteId);
  if (!parsed.success) return { error: "Convite inválido." };
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { error: "Sua sessão expirou." };

  const { data: invite } = await supabase
    .from("clinic_invites")
    .select("id,email,status,expires_at,auth_user_id,onboarding_completed_at")
    .eq("id", parsed.data)
    .eq("email", auth.user.email.toLowerCase())
    .maybeSingle();
  if (!invite) return { error: "Não foi possível validar este convite." };
  if (invite.email.toLowerCase() !== auth.user.email.toLowerCase())
    return { error: "Este convite foi enviado para outro endereço de e-mail." };
  if (invite.status === "accepted") {
    if (invite.auth_user_id !== auth.user.id)
      return { error: "Este convite já foi utilizado." };
    if (invite.onboarding_completed_at) redirect("/dashboard");
    redirect(`/auth/professional-onboarding?invite=${parsed.data}`);
  }
  if (["cancelled", "revoked"].includes(invite.status))
    return { error: "Não foi possível validar este convite." };
  if (
    invite.status === "expired" ||
    new Date(invite.expires_at).getTime() <= Date.now()
  )
    return {
      error:
        "Este convite expirou. Solicite um novo convite ao administrador da clínica.",
    };
  if (!["pending", "sent"].includes(invite.status))
    return { error: "Não foi possível validar este convite." };

  const requiresPassword = auth.user.user_metadata?.invitation_id === invite.id;
  if (requiresPassword) {
    if (!passwordSchema.safeParse(password).success)
      return {
        error: "A senha deve ter ao menos 8 caracteres, uma letra e um número.",
      };
    const { error: passwordError } = await supabase.auth.updateUser({
      password,
    });
    if (passwordError)
      return {
        error: "Não foi possível concluir seu cadastro. Tente novamente.",
      };
  }

  const { error } = await supabase.rpc("accept_my_clinic_invite", {
    invite_id: parsed.data,
  });
  if (error) {
    console.error("ASTER_INVITE_ACCEPTANCE", {
      inviteId: parsed.data,
      code: error.code,
    });
    return {
      error: error.message?.includes("expirou")
        ? "Este convite expirou. Solicite um novo convite ao administrador da clínica."
        : error.message?.includes("cancelado")
          ? "Não foi possível validar este convite."
          : error.message?.includes("não pertence")
            ? "Este convite foi enviado para outro endereço de e-mail."
            : "Não foi possível concluir seu cadastro. Tente novamente.",
    };
  }
  redirect(`/auth/professional-onboarding?invite=${parsed.data}`);
}
