"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
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
  const id = idSchema.safeParse(inviteId);
  const parsed = profileSchema.safeParse(input);
  if (!id.success || !parsed.success)
    return { error: "Revise os dados obrigatórios e aceite os termos." };
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou." };
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
    console.error("ASTER_ONBOARDING", {
      invitationId: id.data,
      code: error.code,
    });
    return { error: "Não foi possível concluir seu onboarding." };
  }
  return {
    success: "Seu ambiente está pronto.",
    destination:
      typeof data === "string" && data.startsWith("/") ? data : "/dashboard",
  };
}
