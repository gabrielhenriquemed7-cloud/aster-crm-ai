"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Clinic, TeamRecord } from "@/lib/clinics/types";
import {
  getProfessionalInviteCallbackUrl,
  PublicAppUrlConfigurationError,
} from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const assignableRoles = [
  "clinic_admin",
  "doctor",
  "secretary",
  "receptionist",
] as const;
const inviteSchema = z
  .object({
    email: z.string().trim().email("Informe um e-mail válido."),
    full_name: z.string().trim().min(3, "Informe o nome completo.").max(160),
    role: z.enum(assignableRoles),
    specialty: z.string().trim().max(120).optional(),
    council: z.string().trim().max(30).optional(),
    council_number: z.string().trim().max(40).optional(),
    council_state: z
      .string()
      .trim()
      .regex(/^$|^[A-Za-z]{2}$/, "Informe a UF com duas letras.")
      .optional(),
    phone: z.string().trim().max(30).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.role === "doctor" &&
      (!value.council || !value.council_number || !value.council_state)
    )
      context.addIssue({
        code: "custom",
        path: ["council"],
        message: "Informe conselho, número e UF para o médico.",
      });
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
  status?: number;
  stack?: string;
} | null;

// TEMP_INVITE_DIAGNOSTICS: remover depois de identificar a falha do convite.
function inviteDiagnostic(
  phase: "before" | "after" | "error",
  stage: string,
  details: Record<string, unknown> = {},
) {
  const method = phase === "error" ? console.error : console.info;
  method("ASTER_INVITE_DIAGNOSTIC", {
    temporary: true,
    origin: "src/app/(dashboard)/settings/team/actions.ts",
    action: "inviteClinicMember",
    phase,
    stage,
    ...details,
  });
}

function inviteErrorDetails(error: unknown) {
  if (error instanceof Error)
    return {
      name: error.name,
      code: (error as Error & { code?: string }).code,
      message: error.message,
      stack: error.stack,
    };

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message =
      typeof value.message === "string" ? value.message : String(error);
    return {
      name: value.name,
      code: value.code,
      status: value.status,
      message,
      details: value.details,
      hint: value.hint,
      stack: value.stack ?? new Error(message).stack,
    };
  }

  return { message: String(error), stack: undefined };
}

type InviteDeliveryConfiguration = {
  supabaseUrlPresent: boolean;
  serviceRoleKeyPresent: boolean;
  siteUrlPresent: boolean;
};

function inviteDeliverySafeDiagnostic(input: {
  stage: string;
  code?: string | null;
  message?: string | null;
  status?: number | null;
  callback?: string | null;
  configuration: InviteDeliveryConfiguration;
}) {
  const method = input.code ? console.error : console.info;
  method("ASTER_INVITE_DELIVERY_SAFE_DIAGNOSTIC", {
    stage: input.stage,
    code: input.code ?? null,
    message: input.message ?? null,
    status: input.status ?? null,
    callback: input.callback ?? null,
    configuration: input.configuration,
  });
}

function inviteTechnicalFailure(error: unknown, fallbackCode: string) {
  const details = inviteErrorDetails(error) as {
    code?: unknown;
    message?: unknown;
  };
  const code =
    typeof details.code === "string" && details.code.trim()
      ? details.code.trim()
      : fallbackCode;
  const message =
    typeof details.message === "string" && details.message.trim()
      ? details.message.trim()
      : "O Supabase não informou detalhes adicionais.";
  return `Falha ao enviar convite: ${code} — ${message}`;
}

function sanitizedInvitePayload(input: unknown) {
  if (!input || typeof input !== "object") return { inputType: typeof input };

  const value = input as Record<string, unknown>;
  const email = typeof value.email === "string" ? value.email : "";
  const emailDomain = email.includes("@") ? email.split("@").pop() : undefined;
  return {
    emailDomain,
    fullNameProvided:
      typeof value.full_name === "string" && value.full_name.trim().length > 0,
    role: typeof value.role === "string" ? value.role : undefined,
    specialtyProvided:
      typeof value.specialty === "string" && value.specialty.trim().length > 0,
    councilProvided:
      typeof value.council === "string" && value.council.trim().length > 0,
    councilNumberProvided:
      typeof value.council_number === "string" &&
      value.council_number.trim().length > 0,
    councilStateProvided:
      typeof value.council_state === "string" &&
      value.council_state.trim().length > 0,
    phoneProvided:
      typeof value.phone === "string" && value.phone.trim().length > 0,
  };
}

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
  role: string;
}) {
  const sanitizedPayload = {
    invitationId: input.invitationId,
    clinicId: input.clinicId,
    role: input.role,
    emailDomain: input.email.split("@").pop(),
    fullNameProvided: Boolean(input.fullName?.trim()),
  };
  inviteDiagnostic("before", "supabase_auth_admin_configuration", {
    payload: sanitizedPayload,
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configuration = {
    supabaseUrlPresent: Boolean(url),
    serviceRoleKeyPresent: Boolean(serviceKey),
    siteUrlPresent: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()),
  };
  if (!url || !serviceKey) {
    const missingVariables = [
      !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter(Boolean);
    const technicalMessage = `Falha ao enviar convite: MISSING_SERVER_CONFIGURATION — variável ausente: ${missingVariables.join(", ")}.`;
    inviteDeliverySafeDiagnostic({
      stage: "supabase_auth_admin_configuration",
      code: "MISSING_SERVER_CONFIGURATION",
      message: "Variável obrigatória ausente.",
      configuration,
    });
    inviteDiagnostic("error", "supabase_auth_admin_configuration", {
      invitationId: input.invitationId,
      payload: sanitizedPayload,
      code: "MISSING_SERVER_CONFIGURATION",
      message: "Supabase URL ou service role ausente.",
      stack: new Error("Supabase URL ou service role ausente.").stack,
    });
    return {
      error: "MISSING_SERVER_CONFIGURATION",
      message: technicalMessage,
    };
  }
  inviteDiagnostic("after", "supabase_auth_admin_configuration", {
    invitationId: input.invitationId,
  });

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let redirectTo: string;
  try {
    redirectTo = getProfessionalInviteCallbackUrl();
  } catch (error) {
    const message =
      error instanceof PublicAppUrlConfigurationError
        ? error.message
        : "Não foi possível resolver a URL pública do ASTER.";
    inviteDiagnostic("error", "invite_callback_configuration", {
      invitationId: input.invitationId,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
      code: "INVALID_PUBLIC_APP_URL",
      message,
    });
    inviteDeliverySafeDiagnostic({
      stage: "invite_callback_configuration",
      code: "APP_URL_CONFIGURATION_ERROR",
      message,
      configuration,
    });
    return {
      error: "APP_URL_CONFIGURATION_ERROR",
      message: `Falha ao enviar convite: APP_URL_CONFIGURATION_ERROR — ${message}`,
    };
  }
  const data = {
    full_name: input.fullName ?? "",
    clinic_id: input.clinicId,
    clinic_name: input.clinicName,
    invitation_id: input.invitationId,
    role: input.role,
  };
  inviteDiagnostic("before", "supabase_auth_admin_list_users", {
    invitationId: input.invitationId,
    payload: sanitizedPayload,
  });
  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    inviteDeliverySafeDiagnostic({
      stage: "supabase_auth_admin_list_users",
      code: listError.code,
      message: listError.message,
      status: listError.status,
      callback: redirectTo,
      configuration,
    });
    inviteDiagnostic("error", "supabase_auth_admin_list_users", {
      invitationId: input.invitationId,
      payload: sanitizedPayload,
      ...inviteErrorDetails(listError),
    });
    return {
      error: "EMAIL_PROVIDER_ERROR",
      message: inviteTechnicalFailure(listError, "AUTH_USER_LOOKUP_FAILED"),
    };
  }
  inviteDiagnostic("after", "supabase_auth_admin_list_users", {
    invitationId: input.invitationId,
  });
  const existing = users.users.some(
    (user) => user.email?.toLowerCase() === input.email,
  );
  inviteDeliverySafeDiagnostic({
    stage: existing ? "magic_link_delivery" : "invite_delivery",
    callback: redirectTo,
    configuration,
  });
  console.info("ASTER_PROFESSIONAL_INVITE_AUTH", {
    flow: existing ? "magic_link" : "invite",
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
    callback: redirectTo,
    userState: existing ? "existing" : "new",
  });
  inviteDiagnostic("before", "supabase_auth_invite_delivery", {
    invitationId: input.invitationId,
    payload: sanitizedPayload,
    providerMethod: existing
      ? "auth.signInWithOtp"
      : "auth.admin.inviteUserByEmail",
  });
  const result = existing
    ? await admin.auth.signInWithOtp({
        email: input.email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false, data },
      })
    : await (async () => {
        console.info("ASTER_INVITE_REDIRECT_DIAGNOSTIC", {
          NODE_ENV: process.env.NODE_ENV,
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
          redirectTo,
          VERCEL_ENV: process.env.VERCEL_ENV,
          VERCEL_URL: process.env.VERCEL_URL,
        });
        return admin.auth.admin.inviteUserByEmail(input.email, {
          data,
          redirectTo,
        });
      })();
  if (result.error) {
    inviteDeliverySafeDiagnostic({
      stage: existing ? "magic_link_delivery" : "invite_delivery",
      code: result.error.code,
      message: result.error.message,
      status: result.error.status,
      callback: redirectTo,
      configuration,
    });
    inviteDiagnostic("error", "supabase_auth_invite_delivery", {
      invitationId: input.invitationId,
      payload: sanitizedPayload,
      providerMethod: existing
        ? "auth.signInWithOtp"
        : "auth.admin.inviteUserByEmail",
      ...inviteErrorDetails(result.error),
    });
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
      message: inviteTechnicalFailure(result.error, "EMAIL_PROVIDER_ERROR"),
    };
  }
  inviteDiagnostic("after", "supabase_auth_invite_delivery", {
    invitationId: input.invitationId,
    providerMethod: existing
      ? "auth.signInWithOtp"
      : "auth.admin.inviteUserByEmail",
  });
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
  const sanitizedPayload = sanitizedInvitePayload(input);
  inviteDiagnostic("before", "input_validation", {
    payload: sanitizedPayload,
  });
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    inviteDiagnostic("error", "input_validation", {
      code: "VALIDATION_ERROR",
      message: parsed.error.message,
      issues: parsed.error.issues,
      payload: sanitizedPayload,
      stack: new Error(parsed.error.message).stack,
    });
    inviteDiagnostic("before", "frontend_response", {
      outcome: "error",
      failedAt: "input_validation",
      payload: sanitizedPayload,
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do convite inválidos.",
    };
  }
  inviteDiagnostic("after", "input_validation", {
    role: parsed.data.role,
    payload: sanitizedPayload,
  });

  inviteDiagnostic("before", "admin_context_validation");
  const current = await adminContext();
  if (current.error) {
    inviteDiagnostic("error", "admin_context_validation", {
      code: "ADMIN_CONTEXT_ERROR",
      message: current.error,
      payload: sanitizedPayload,
      stack: new Error(current.error).stack,
    });
    inviteDiagnostic("before", "frontend_response", {
      outcome: "error",
      failedAt: "admin_context_validation",
      payload: sanitizedPayload,
    });
    return { error: current.error };
  }
  inviteDiagnostic("after", "admin_context_validation", {
    clinicId: current.clinicId,
    payload: sanitizedPayload,
  });

  inviteDiagnostic("before", "invite_persistence", {
    clinicId: current.clinicId,
  });
  inviteDiagnostic("before", "audit_invite_created", {
    clinicId: current.clinicId,
    auditOrigin: "inside create_clinic_invite RPC",
  });
  inviteDiagnostic("before", "rpc_create_clinic_invite", {
    rpc: "create_clinic_invite",
    clinicId: current.clinicId,
  });
  const { data: inviteId, error } = await current.supabase.rpc(
    "create_clinic_invite",
    {
      invite_email: parsed.data.email,
      invite_full_name: parsed.data.full_name,
      invite_role: parsed.data.role,
      invite_metadata: {
        specialty: parsed.data.specialty || null,
        council: parsed.data.council || null,
        council_number: parsed.data.council_number || null,
        council_state: parsed.data.council_state?.toUpperCase() || null,
        phone: parsed.data.phone || null,
      },
    },
  );
  if (error || !inviteId) {
    inviteDiagnostic("error", "rpc_create_clinic_invite", {
      rpc: "create_clinic_invite",
      clinicId: current.clinicId,
      returnedInviteId: inviteId ?? null,
      payload: sanitizedPayload,
      ...(error
        ? inviteErrorDetails(error)
        : {
            code: "EMPTY_RPC_RESULT",
            message: "A RPC não retornou o identificador do convite.",
            stack: new Error("A RPC não retornou o identificador do convite.")
              .stack,
          }),
    });
    inviteDiagnostic("error", "invite_persistence", {
      clinicId: current.clinicId,
      failedAt: "rpc_create_clinic_invite",
      payload: sanitizedPayload,
      ...(error ? inviteErrorDetails(error) : { code: "EMPTY_RPC_RESULT" }),
    });
    inviteDiagnostic("error", "audit_invite_created", {
      clinicId: current.clinicId,
      failedAt: "rpc_create_clinic_invite",
      payload: sanitizedPayload,
      ...(error ? inviteErrorDetails(error) : { code: "EMPTY_RPC_RESULT" }),
    });
    inviteDiagnostic("before", "frontend_response", {
      outcome: "error",
      failedAt: "rpc_create_clinic_invite",
      payload: sanitizedPayload,
    });
    return {
      error: databaseMessage(error, "Não foi possível registrar o convite."),
    };
  }
  inviteDiagnostic("after", "rpc_create_clinic_invite", {
    rpc: "create_clinic_invite",
    invitationId: inviteId,
  });
  inviteDiagnostic("after", "invite_persistence", {
    invitationId: inviteId,
  });
  inviteDiagnostic("after", "audit_invite_created", {
    invitationId: inviteId,
    auditOrigin: "inside create_clinic_invite RPC",
  });

  inviteDiagnostic("before", "clinic_lookup", { invitationId: inviteId });
  const { data: clinic } = await current.supabase
    .from("clinics")
    .select("name")
    .eq("id", current.clinicId)
    .single();
  inviteDiagnostic("after", "clinic_lookup", {
    invitationId: inviteId,
    clinicFound: Boolean(clinic),
  });
  const delivery = await sendInviteEmail({
    email: parsed.data.email.toLowerCase(),
    fullName: parsed.data.full_name,
    clinicId: current.clinicId,
    clinicName: clinic?.name ?? "sua clínica",
    invitationId: inviteId,
    role: parsed.data.role,
  });
  inviteDiagnostic("before", "audit_delivery_status", {
    invitationId: inviteId,
    auditOrigin: "inside record_clinic_invite_delivery RPC",
  });
  inviteDiagnostic("before", "rpc_record_clinic_invite_delivery", {
    rpc: "record_clinic_invite_delivery",
    invitationId: inviteId,
  });
  const { error: deliveryRecordError } = await current.supabase.rpc(
    "record_clinic_invite_delivery",
    {
      invite_id: inviteId,
      delivery_succeeded: !delivery.error,
      delivery_code: delivery.error,
    },
  );
  if (deliveryRecordError) {
    console.error("RPC_RECORD_CLINIC_INVITE_DELIVERY_ERROR", {
      code: deliveryRecordError.code,
      message: deliveryRecordError.message,
      details: deliveryRecordError.details,
      hint: deliveryRecordError.hint,
      invitationId: inviteId,
    });
    inviteDiagnostic("error", "rpc_record_clinic_invite_delivery", {
      rpc: "record_clinic_invite_delivery",
      invitationId: inviteId,
      payload: sanitizedPayload,
      ...inviteErrorDetails(deliveryRecordError),
    });
    inviteDiagnostic("error", "audit_delivery_status", {
      invitationId: inviteId,
      failedAt: "rpc_record_clinic_invite_delivery",
      payload: sanitizedPayload,
      ...inviteErrorDetails(deliveryRecordError),
    });
  } else {
    inviteDiagnostic("after", "rpc_record_clinic_invite_delivery", {
      rpc: "record_clinic_invite_delivery",
      invitationId: inviteId,
    });
    inviteDiagnostic("after", "audit_delivery_status", {
      invitationId: inviteId,
      auditOrigin: "inside record_clinic_invite_delivery RPC",
    });
  }
  revalidatePath("/settings/team");
  if (delivery.error) {
    inviteDiagnostic("before", "frontend_response", {
      outcome: "error",
      failedAt: "supabase_auth_invite_delivery",
      code: delivery.error,
      message: delivery.message,
      invitationId: inviteId,
      payload: sanitizedPayload,
    });
    return { error: delivery.message! };
  }
  if (deliveryRecordError) {
    console.error("ASTER_INVITE_RECONCILIATION", {
      invitationId: inviteId,
      code: deliveryRecordError.code,
    });
    inviteDiagnostic("before", "frontend_response", {
      outcome: "error",
      failedAt: "rpc_record_clinic_invite_delivery",
      invitationId: inviteId,
      payload: sanitizedPayload,
      ...inviteErrorDetails(deliveryRecordError),
    });
    return {
      error:
        "O e-mail foi enviado, mas o status precisa ser reconciliado. Atualize a lista antes de reenviar.",
    };
  }
  inviteDiagnostic("before", "frontend_response", {
    outcome: "success",
    invitationId: inviteId,
    payload: sanitizedPayload,
  });
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
    role: invite.role ?? "",
  });
  const { error: deliveryRecordError } = await current.supabase.rpc(
    "record_clinic_invite_delivery",
    {
      invite_id: parsed.data,
      delivery_succeeded: !delivery.error,
      delivery_code: delivery.error,
    },
  );
  if (delivery.error) return { error: delivery.message! };
  if (deliveryRecordError) {
    console.error("ASTER_INVITE_RECONCILIATION", {
      invitationId: parsed.data,
      code: deliveryRecordError.code,
    });
    return {
      error:
        "O e-mail foi enviado, mas o status precisa ser reconciliado. Atualize a lista antes de reenviar.",
    };
  }
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
