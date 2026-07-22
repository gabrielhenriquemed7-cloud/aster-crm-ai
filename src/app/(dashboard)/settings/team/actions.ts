"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Clinic, TeamRecord } from "@/lib/clinics/types";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const assignableRoles = [
  "clinic_admin",
  "doctor",
  "secretary",
  "receptionist",
] as const;
const inviteSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  full_name: z.string().trim().min(3, "Informe o nome completo.").max(160),
  role: z.enum(assignableRoles),
});
const updateSchema = z
  .object({
    role: z.enum(assignableRoles).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine(
    (value) => value.role || value.status,
    "Nenhuma alteração informada.",
  );
const idSchema = z.string().uuid("Identificador inválido.");

type SupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null;
function databaseMessage(error: SupabaseError, fallback: string) {
  console.error("ASTER_SETTINGS_ERROR", {
    section: "users",
    code: error?.code,
  });
  const safeMessages = [
    "Este profissional já possui acesso à clínica.",
    "Já existe um convite pendente para este e-mail.",
    "Aguarde um minuto antes de reenviar o convite.",
  ];
  return safeMessages.includes(error?.message ?? "")
    ? error!.message!
    : fallback;
}

async function adminContext() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." as const };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return { error: "Sua sessão expirou. Entre novamente." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id)
    return { error: "Selecione uma clínica ativa." as const };

  const { data: membership } = await supabase
    .from("clinic_members")
    .select("role, status")
    .eq("user_id", auth.user.id)
    .eq("clinic_id", profile.active_clinic_id)
    .maybeSingle();
  if (membership?.role !== "clinic_admin" || membership.status !== "active") {
    return { error: "Sem permissão para administrar esta clínica." as const };
  }

  return {
    supabase,
    user: auth.user,
    clinicId: profile.active_clinic_id,
    error: null,
  };
}

async function sendInviteEmail(input: {
  email: string;
  fullName?: string | null;
  clinicId: string;
  clinicName: string;
  invitationId: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return {
      error:
        "Configure a chave de serviço somente no servidor para enviar convites.",
    };

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const redirectTo = `${getSiteUrl()}/auth/callback?next=/auth/accept-invite`;
  const data = {
    full_name: input.fullName ?? "",
    clinic_id: input.clinicId,
    clinic_name: input.clinicName,
    invitation_id: input.invitationId,
  };
  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError)
    return {
      error: "EMAIL_PROVIDER_ERROR",
      message:
        "Não foi possível enviar o e-mail. O convite foi preservado para nova tentativa.",
    };
  const existing = users.users.some(
    (user) => user.email?.toLowerCase() === input.email,
  );
  const result = existing
    ? await admin.auth.signInWithOtp({
        email: input.email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false, data },
      })
    : await admin.auth.admin.inviteUserByEmail(input.email, {
        data,
        redirectTo,
      });
  if (result.error) {
    console.error("ASTER_INVITE_DELIVERY", {
      invitationId: input.invitationId,
      code: result.error.code,
      status: result.error.status,
    });
    return {
      error:
        result.error.status === 429
          ? "EMAIL_RATE_LIMITED"
          : "EMAIL_PROVIDER_ERROR",
      message:
        "Não foi possível enviar o e-mail. O convite foi preservado para nova tentativa.",
    };
  }
  return { error: null, message: null };
}

export async function getClinicContext() {
  const current = await adminContext();
  if (current.error) {
    return {
      clinic: null as Clinic | null,
      records: [] as TeamRecord[],
      error: current.error,
    };
  }

  const [
    { data: clinic, error: clinicError },
    { data: records, error: teamError },
  ] = await Promise.all([
    current.supabase
      .from("clinics")
      .select("*")
      .eq("id", current.clinicId)
      .single(),
    current.supabase.rpc("list_active_clinic_team"),
  ]);
  if (clinicError || teamError) {
    return {
      clinic: null as Clinic | null,
      records: [] as TeamRecord[],
      error: databaseMessage(
        clinicError ?? teamError,
        "Não foi possível carregar a equipe.",
      ),
    };
  }
  return {
    clinic: clinic as Clinic,
    records: (records ?? []) as TeamRecord[],
    error: null,
  };
}

export async function inviteClinicMember(input: unknown) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do convite inválidos.",
    };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { data: inviteId, error } = await current.supabase.rpc(
    "create_clinic_invite",
    {
      invite_email: parsed.data.email,
      invite_full_name: parsed.data.full_name,
      invite_role: parsed.data.role,
    },
  );
  if (error || !inviteId)
    return {
      error: databaseMessage(error, "Não foi possível registrar o convite."),
    };

  const { data: clinic } = await current.supabase
    .from("clinics")
    .select("name")
    .eq("id", current.clinicId)
    .single();
  const delivery = await sendInviteEmail({
    email: parsed.data.email.toLowerCase(),
    fullName: parsed.data.full_name,
    clinicId: current.clinicId,
    clinicName: clinic?.name ?? "sua clínica",
    invitationId: inviteId,
  });
  await current.supabase.rpc("record_clinic_invite_delivery", {
    invite_id: inviteId,
    delivery_succeeded: !delivery.error,
    delivery_code: delivery.error,
  });
  revalidatePath("/settings/team");
  if (delivery.error) return { error: delivery.message! };
  return {
    success: `Convite enviado para ${parsed.data.email.toLowerCase()}.`,
  };
}

export async function updateClinicMember(id: string, input: unknown) {
  const parsedId = idSchema.safeParse(id);
  const parsed = updateSchema.safeParse(input);
  if (!parsedId.success || !parsed.success)
    return { error: "Alteração inválida." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { error } = await current.supabase.rpc("update_active_clinic_member", {
    member_id: parsedId.data,
    member_role: parsed.data.role ?? null,
    member_status: parsed.data.status ?? null,
  });
  if (error)
    return {
      error: databaseMessage(error, "Não foi possível atualizar o usuário."),
    };
  revalidatePath("/settings/team");
  return { success: "Usuário atualizado com sucesso." };
}

export async function removeClinicMember(id: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: "Vínculo inválido." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { error } = await current.supabase.rpc("remove_active_clinic_member", {
    member_id: parsed.data,
  });
  if (error)
    return {
      error: databaseMessage(error, "Não foi possível remover o vínculo."),
    };
  revalidatePath("/settings/team");
  return { success: "Vínculo removido com sucesso." };
}

export async function resendClinicInvite(id: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: "Convite inválido." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { data, error } = await current.supabase.rpc(
    "renew_active_clinic_invite",
    { invite_id: parsed.data },
  );
  const invite = Array.isArray(data) ? data[0] : data;
  if (error || !invite?.email)
    return {
      error: databaseMessage(error, "Não foi possível renovar o convite."),
    };
  const { data: clinic } = await current.supabase
    .from("clinics")
    .select("name")
    .eq("id", current.clinicId)
    .single();
  const delivery = await sendInviteEmail({
    email: invite.email,
    fullName: invite.full_name,
    clinicId: current.clinicId,
    clinicName: clinic?.name ?? "sua clínica",
    invitationId: parsed.data,
  });
  await current.supabase.rpc("record_clinic_invite_delivery", {
    invite_id: parsed.data,
    delivery_succeeded: !delivery.error,
    delivery_code: delivery.error,
  });
  if (delivery.error) return { error: delivery.message! };
  revalidatePath("/settings/team");
  return { success: `Convite reenviado para ${invite.email}.` };
}

export async function revokeClinicInvite(id: string, reason?: string) {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { error: "Convite inválido." };
  const current = await adminContext();
  if (current.error) return { error: current.error };

  const { error } = await current.supabase.rpc("revoke_active_clinic_invite", {
    invite_id: parsed.data,
    reason: reason?.trim() || null,
  });
  if (error)
    return {
      error: databaseMessage(error, "Não foi possível cancelar o convite."),
    };
  revalidatePath("/settings/team");
  return { success: "Convite cancelado." };
}
