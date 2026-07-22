"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function getPendingInvite() {
  const supabase = await createClient();
  if (!supabase) return { invite: null, error: "Serviço indisponível." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email)
    return {
      invite: null,
      error: "Sua sessão expirou. Abra novamente o link recebido por e-mail.",
    };
  const { data, error } = await supabase
    .from("clinic_invites")
    .select("id, full_name, email, role, status, expires_at, clinics(name)")
    .eq("email", auth.user.email.toLowerCase())
    .in("status", ["pending", "sent", "expired", "cancelled", "revoked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data)
    return {
      invite: null,
      error: "Nenhum convite válido foi encontrado para este e-mail.",
    };
  if (["cancelled", "revoked"].includes(data.status))
    return { invite: data, error: "Este convite foi cancelado pela clínica." };
  if (
    data.status === "expired" ||
    new Date(data.expires_at).getTime() <= Date.now()
  )
    return {
      invite: data,
      error: "Este convite expirou. Solicite um novo envio à clínica.",
    };
  return { invite: data, error: null };
}

export async function acceptClinicInvite(inviteId: string) {
  const parsed = idSchema.safeParse(inviteId);
  if (!parsed.success) return { error: "Convite inválido." };
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou." };
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
        ? "Este convite expirou. Solicite um novo envio à clínica."
        : error.message?.includes("cancelado")
          ? "Este convite foi cancelado pela clínica."
          : "Não foi possível ativar seu acesso.",
    };
  }
  redirect("/dashboard?invite=accepted");
}
