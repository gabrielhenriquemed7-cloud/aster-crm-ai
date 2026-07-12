"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Clinic, TeamRecord } from "@/lib/clinics/types";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const assignableRoles = ["clinic_admin", "doctor", "secretary", "receptionist"] as const;
const inviteSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  full_name: z.string().trim().min(3, "Informe o nome completo.").max(160),
  role: z.enum(assignableRoles),
});
const updateSchema = z.object({
  role: z.enum(assignableRoles).optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => value.role || value.status, "Nenhuma alteração informada.");
const idSchema = z.string().uuid("Identificador inválido.");

type SupabaseError = { message?: string; details?: string; hint?: string; code?: string } | null;
function databaseMessage(error: SupabaseError, fallback: string) {
  console.error("ASTER_SETTINGS_ERROR", { section: "users", message: error?.message, details: error?.details, hint: error?.hint, code: error?.code });
  return `${error?.code ?? "SEM_CODIGO"}: ${error?.message ?? fallback}`;
}

async function adminContext() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." as const };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou. Entre novamente." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id) return { error: "Selecione uma clínica ativa." as const };

  const { data: membership } = await supabase
    .from("clinic_members")
    .select("role, status")
    .eq("user_id", auth.user.id)
    .eq("clinic_id", profile.active_clinic_id)
    .maybeSingle();
  if (membership?.role !== "clinic_admin" || membership.status !== "active") {
    return { error: "Sem permissão para administrar esta clínica." as const };
  }

  return { supabase, user: auth.user, clinicId: profile.active_clinic_id, error: null };
}

async function sendInviteEmail(email: string, fullName?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { error: "Configure a chave de serviço somente no servidor para enviar convites." };

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const redirectTo = `${getSiteUrl()}/auth/callback?next=/dashboard`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName ?? "" },
    redirectTo,
  });
  if (!error) return { error: null };

  const supabase = await createClient();
  if (!supabase) return { error: "Não foi possível enviar o e-mail de convite." };
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  return { error: otpError ? "Convite registrado, mas o e-mail não pôde ser enviado." : null };
}

export async function getClinicContext() {
  const current = await adminContext();
  if (current.error) {
    return { clinic: null as Clinic | null, records: [] as TeamRecord[], error: current.error };
  }

  const [{ data: clinic, error: clinicError }, { data: records, error: teamError }] = await Promise.all([
    current.supabase.from("clinics").select("*").eq("id", current.clinicId).single(),
    current.supabase.rpc("list_active_clinic_team"),
  ]);
  if (clinicError || teamError) {
    return { clinic: null as Clinic | null, records: [] as TeamRecord[], error: databaseMessage(clinicError ?? teamError, "Não foi possível carregar a equipe.") };
  }
  return { clinic: clinic as Clinic, records: (records ?? []) as TeamRecord[], error: null };
}

export async function inviteClinicMember(input: unknown) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados do convite inválidos." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { data: inviteId, error } = await current.supabase.rpc("create_clinic_invite", {
    invite_email: parsed.data.email,
    invite_full_name: parsed.data.full_name,
    invite_role: parsed.data.role,
  });
  if (error || !inviteId) return { error: databaseMessage(error, "Não foi possível registrar o convite.") };

  const delivery = await sendInviteEmail(parsed.data.email, parsed.data.full_name);
  revalidatePath("/settings/team");
  if (delivery.error) return { error: delivery.error };
  return { success: `Convite enviado para ${parsed.data.email}.` };
}

export async function updateClinicMember(id: string, input: unknown) {
  const parsedId = idSchema.safeParse(id);
  const parsed = updateSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { error: "Alteração inválida." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { error } = await current.supabase.rpc("update_active_clinic_member", {
    member_id: parsedId.data,
    member_role: parsed.data.role ?? null,
    member_status: parsed.data.status ?? null,
  });
  if (error) return { error: databaseMessage(error, "Não foi possível atualizar o usuário.") };
  revalidatePath("/settings/team");
  return { success: "Usuário atualizado com sucesso." };
}

export async function removeClinicMember(id: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: "Vínculo inválido." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { error } = await current.supabase.rpc("remove_active_clinic_member", { member_id: parsed.data });
  if (error) return { error: databaseMessage(error, "Não foi possível remover o vínculo.") };
  revalidatePath("/settings/team");
  return { success: "Vínculo removido com sucesso." };
}

export async function resendClinicInvite(id: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: "Convite inválido." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { data: email, error } = await current.supabase.rpc("renew_active_clinic_invite", { invite_id: parsed.data });
  if (error || !email) return { error: databaseMessage(error, "Não foi possível renovar o convite.") };
  const delivery = await sendInviteEmail(email);
  if (delivery.error) return { error: delivery.error };
  revalidatePath("/settings/team");
  return { success: `Convite reenviado para ${email}.` };
}

export async function revokeClinicInvite(id: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: "Convite inválido." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { error } = await current.supabase.rpc("revoke_active_clinic_invite", { invite_id: parsed.data });
  if (error) return { error: databaseMessage(error, "Não foi possível cancelar o convite.") };
  revalidatePath("/settings/team");
  return { success: "Convite cancelado." };
}
