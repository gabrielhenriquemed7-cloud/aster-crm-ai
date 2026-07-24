"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const ONBOARDING_ACTION = "complete_professional_onboarding";
type OnboardingStage =
  | "session_validation"
  | "invitation_lookup"
  | "invitation_validation"
  | "profile_update"
  | "membership_activation"
  | "invitation_acceptance"
  | "active_clinic_assignment"
  | "onboarding_completion"
  | "redirect"
  | "error";

type DiagnosticState = {
  userIdPresent: boolean;
  invitationIdPresent: boolean;
  clinicIdPresent: boolean;
  role: string | null;
  profileUpdateSuccess: boolean;
  membershipUpdateSuccess: boolean;
  invitationAcceptSuccess: boolean;
  activeClinicUpdateSuccess: boolean;
};

function safeDiagnosticText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[id]",
    )
    .replace(/\b[^@\s]+@[^@\s]+\.[^@\s]+\b/g, "[email]")
    .slice(0, 500);
}

function onboardingDiagnostic(
  phase: "validation" | "completion",
  stage: OnboardingStage,
  state: DiagnosticState,
  error?: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  },
) {
  console.info("ASTER_ONBOARDING_DIAGNOSTIC", {
    action: ONBOARDING_ACTION,
    phase,
    stage,
    userIdPresent: state.userIdPresent,
    invitationIdPresent: state.invitationIdPresent,
    clinicIdPresent: state.clinicIdPresent,
    role: state.role,
    profileUpdateSuccess: state.profileUpdateSuccess,
    membershipUpdateSuccess: state.membershipUpdateSuccess,
    invitationAcceptSuccess: state.invitationAcceptSuccess,
    activeClinicUpdateSuccess: state.activeClinicUpdateSuccess,
    errorCode: safeDiagnosticText(error?.code),
    errorMessage: safeDiagnosticText(error?.message),
    errorDetails: safeDiagnosticText(error?.details),
    errorHint: safeDiagnosticText(error?.hint),
  });
}

function onboardingErrorStage(
  code?: string,
  message?: string,
): OnboardingStage {
  const normalized = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (
    normalized.includes("profissional precisa ter vínculo ativo") ||
    normalized.includes("professional_profiles")
  )
    return "profile_update";
  if (normalized.includes("clinic_members") || normalized.includes("vínculo"))
    return "membership_activation";
  if (normalized.includes("active_clinic")) return "active_clinic_assignment";
  if (normalized.includes("clinic_invites")) return "invitation_acceptance";
  return "onboarding_completion";
}

const profileSchema = z.object({
  full_name: z.string().trim().min(3).max(160),
  phone: z.string().trim().max(30).optional(),
  specialty: z.string().trim().max(120).optional(),
  council: z.string().trim().max(30).optional(),
  council_number: z.string().trim().max(40).optional(),
  council_state: z
    .string()
    .trim()
    .regex(/^$|^[A-Za-z]{2}$/)
    .optional(),
  photo_url: z.string().trim().url().optional().or(z.literal("")),
  signature_url: z.string().trim().url().optional().or(z.literal("")),
  termsAccepted: z.literal(true),
});

export async function getProfessionalOnboarding(inviteId: string) {
  if (!idSchema.safeParse(inviteId).success)
    return { invite: null, error: "Convite inválido." };
  const supabase = await createClient();
  const { data: auth } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  if (!supabase || !auth.user)
    return { invite: null, error: "Sua sessão expirou." };
  const { data } = await supabase
    .from("clinic_invites")
    .select("id,full_name,email,role,metadata,clinic_id,clinics(name)")
    .eq("id", inviteId)
    .eq("auth_user_id", auth.user.id)
    .eq("status", "accepted")
    .maybeSingle();
  return data
    ? { invite: data, error: null }
    : { invite: null, error: "Onboarding não autorizado para esta conta." };
}

export async function completeProfessionalOnboarding(
  inviteId: string,
  input: unknown,
) {
  const diagnosticState: DiagnosticState = {
    userIdPresent: false,
    invitationIdPresent: false,
    clinicIdPresent: false,
    role: null,
    profileUpdateSuccess: false,
    membershipUpdateSuccess: false,
    invitationAcceptSuccess: false,
    activeClinicUpdateSuccess: false,
  };
  const id = idSchema.safeParse(inviteId);
  const parsed = profileSchema.safeParse(input);
  diagnosticState.invitationIdPresent = id.success;
  if (!id.success || !parsed.success) {
    onboardingDiagnostic(
      "validation",
      "invitation_validation",
      diagnosticState,
      {
        code: "INVALID_ONBOARDING_INPUT",
        message: "Dados obrigatórios inválidos.",
      },
    );
    return { error: "Revise os dados obrigatórios e aceite os termos." };
  }

  const supabase = await createClient();
  if (!supabase) {
    onboardingDiagnostic("validation", "session_validation", diagnosticState, {
      code: "SUPABASE_NOT_CONFIGURED",
      message: "Serviço indisponível.",
    });
    return { error: "Serviço indisponível." };
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  diagnosticState.userIdPresent = Boolean(auth.user?.id);
  onboardingDiagnostic(
    "validation",
    "session_validation",
    diagnosticState,
    authError ?? undefined,
  );
  if (authError || !auth.user?.email) return { error: "Sua sessão expirou." };

  const { data: invitation, error: invitationError } = await supabase
    .from("clinic_invites")
    .select(
      "id,email,status,expires_at,auth_user_id,clinic_id,role,onboarding_completed_at",
    )
    .eq("id", id.data)
    .maybeSingle();
  diagnosticState.clinicIdPresent = Boolean(invitation?.clinic_id);
  diagnosticState.role = invitation?.role ?? null;
  onboardingDiagnostic(
    "validation",
    "invitation_lookup",
    diagnosticState,
    invitationError ?? undefined,
  );
  if (invitationError || !invitation) {
    const code = invitationError?.code ?? "INVITATION_NOT_FOUND";
    return {
      error: `Falha ao concluir onboarding: invitation_lookup — ${code}`,
    };
  }

  const sameEmail =
    invitation.email.toLowerCase() === auth.user.email.toLowerCase();
  const invitationValid =
    sameEmail &&
    invitation.auth_user_id === auth.user.id &&
    invitation.status === "accepted" &&
    new Date(invitation.expires_at).getTime() > Date.now();
  onboardingDiagnostic(
    "validation",
    "invitation_validation",
    diagnosticState,
    invitationValid
      ? undefined
      : {
          code: "INVITATION_VALIDATION_FAILED",
          message: "Convite inválido para o usuário autenticado.",
        },
  );
  if (!invitationValid)
    return {
      error:
        "Falha ao concluir onboarding: invitation_validation — INVITATION_VALIDATION_FAILED",
    };

  const [
    { data: profile, error: profileError },
    { data: membership, error: membershipError },
  ] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("clinic_members")
      .select("id,status,role")
      .eq("clinic_id", invitation.clinic_id)
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);
  onboardingDiagnostic(
    "validation",
    "profile_update",
    diagnosticState,
    profileError ??
      (profile
        ? undefined
        : {
            code: "PROFILE_NOT_FOUND",
            message: "Profile do usuário não encontrado.",
          }),
  );
  onboardingDiagnostic(
    "validation",
    "membership_activation",
    diagnosticState,
    membershipError ??
      (membership
        ? undefined
        : {
            code: "MEMBERSHIP_NOT_FOUND",
            message: "Vínculo da clínica não encontrado.",
          }),
  );

  const profileData = { ...parsed.data };
  delete (profileData as Partial<typeof profileData>).termsAccepted;
  const { data, error } = await supabase.rpc(
    "complete_professional_invite_onboarding",
    {
      invite_id: id.data,
      profile_data: profileData,
      terms_version: "ASTER-TERMS-2026-01",
    },
  );
  if (error) {
    const stage = onboardingErrorStage(error.code, error.message);
    onboardingDiagnostic("completion", stage, diagnosticState, error);
    onboardingDiagnostic("completion", "error", diagnosticState, error);
    return {
      error: `Falha ao concluir onboarding: ${stage} — ${error.code || "SUPABASE_ERROR"}`,
    };
  }

  diagnosticState.profileUpdateSuccess = true;
  diagnosticState.membershipUpdateSuccess = true;
  diagnosticState.invitationAcceptSuccess = true;
  diagnosticState.activeClinicUpdateSuccess = true;
  onboardingDiagnostic("completion", "onboarding_completion", diagnosticState);
  onboardingDiagnostic("completion", "redirect", diagnosticState);
  return {
    success: "Seu ambiente está pronto.",
    destination:
      typeof data === "string" && data.startsWith("/") ? data : "/dashboard",
  };
}
