"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type SettingsSection = "clinic" | "professional" | "schedule" | "documents" | "ai" | "logo" | "context";
type SupabaseError = { message?: string; details?: string; hint?: string; code?: string } | null;

function settingsError(section: SettingsSection, error: SupabaseError, fallback = "Não foi possível concluir a operação.") {
  console.error("ASTER_SETTINGS_ERROR", {
    section,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  });
  return { error: `${error?.code ?? "SEM_CODIGO"}: ${error?.message ?? fallback}` };
}

const optionalUrl = z.string().trim().url("Informe uma URL válida.").or(z.literal("")).optional();
const clinicSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da clínica."), legal_name: z.string().trim().optional(),
  cnpj: z.string().trim().optional(), cnes: z.string().trim().optional(), logo_url: z.string().trim().optional(),
  phone: z.string().trim().optional(), whatsapp: z.string().trim().optional(), email: z.string().trim().email("Informe um e-mail válido.").or(z.literal("")).optional(),
  website: optionalUrl, instagram: z.string().trim().optional(), favicon_url: optionalUrl, zip_code: z.string().trim().optional(),
  address: z.string().trim().optional(), address_number: z.string().trim().optional(), address_complement: z.string().trim().optional(),
  neighborhood: z.string().trim().optional(), city: z.string().trim().optional(), state: z.string().trim().max(2, "Use a sigla da UF.").optional(),
});
const professionalSchema = z.object({
  user_id: z.string().uuid(), professional_name: z.string().trim().optional(), profession: z.string().trim().optional(),
  council: z.string().trim().optional(), council_number: z.string().trim().optional(), council_state: z.string().trim().max(2).optional(),
  specialty: z.string().trim().optional(), sub_specialty: z.string().trim().optional(), rqe: z.string().trim().optional(),
  phone: z.string().trim().optional(), email: z.string().trim().email().or(z.literal("")).optional(), photo_url: optionalUrl,
  signature_url: optionalUrl, stamp_url: optionalUrl, is_active: z.boolean(), is_responsible: z.boolean(),
});
const nullableTime = z.preprocess((value) => value === "" ? null : value, z.string().regex(/^\d{2}:\d{2}$/).nullable());
const integer = (minimum: number, maximum: number) => z.coerce.number().int().min(minimum).max(maximum);
const scheduleSchema = z.object({
  default_duration: integer(5, 1440), interval_between: integer(0, 1440), start_time: nullableTime, end_time: nullableTime,
  lunch_start: nullableTime, lunch_end: nullableTime, minimum_notice: integer(0, 8760), maximum_advance: integer(1, 3650), allow_fit_in: z.boolean(),
});
const documentSchema = z.object({
  header_text: z.string(), footer_text: z.string(), default_city: z.string(), signature_text: z.string(), document_prefix: z.string(),
  show_logo: z.boolean(), show_cnpj: z.boolean(), show_address: z.boolean(), show_phone: z.boolean(), show_email: z.boolean(),
  show_council: z.boolean(), show_specialty: z.boolean(), show_rqe: z.boolean(), physical_signature_space: z.boolean(), automatic_numbering: z.boolean(),
});
const aiSchema = z.object({
  language: z.string().trim().min(2), default_specialty: z.string(), detail_level: z.string().trim().min(2), evolution_format: z.string().trim().min(2),
  consent_text: z.string(), enabled: z.boolean(), suggest_cid: z.boolean(), suggest_differentials: z.boolean(), suggest_exams: z.boolean(),
  suggest_conduct: z.boolean(), require_human_review: z.boolean(),
});

async function context(admin = false) {
  const supabase = await createClient();
  const failure = (error: string) => ({ supabase: null, clinicId: "", userId: "", role: "", error });
  if (!supabase) return failure("SEM_CODIGO: Supabase não configurado.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) return failure(settingsError("context", authError).error);
  if (!auth.user) return failure("SEM_CODIGO: Sessão expirada.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (profileError) return failure(settingsError("context", profileError).error);
  if (!profile?.active_clinic_id) return failure("SEM_CODIGO: Selecione uma clínica ativa.");
  const { data: member, error: memberError } = await supabase.from("clinic_members").select("role,status").eq("clinic_id", profile.active_clinic_id).eq("user_id", auth.user.id).maybeSingle();
  if (memberError) return failure(settingsError("context", memberError).error);
  if (!member || member.status !== "active") return failure("SEM_CODIGO: Sem vínculo ativo com a clínica.");
  if (admin && member.role !== "clinic_admin" && member.role !== "platform_admin") return failure("42501: Somente administradores podem alterar esta configuração.");
  return { supabase, clinicId: profile.active_clinic_id as string, userId: auth.user.id, role: member.role, error: null };
}

const nil = (value?: string) => value?.trim() || null;
const defaults = {
  schedule: { default_duration: 30, interval_between: 0, start_time: "", end_time: "", lunch_start: "", lunch_end: "", minimum_notice: 0, maximum_advance: 90, allow_fit_in: true },
  document: { header_text: "", footer_text: "", default_city: "", signature_text: "", document_prefix: "", show_logo: true, show_cnpj: true, show_address: true, show_phone: true, show_email: true, show_council: true, show_specialty: true, show_rqe: true, physical_signature_space: true, automatic_numbering: true },
  ai: { language: "pt-BR", default_specialty: "", detail_level: "standard", evolution_format: "free", consent_text: "", enabled: false, suggest_cid: true, suggest_differentials: false, suggest_exams: false, suggest_conduct: false, require_human_review: true },
};

export async function getClinicSettings() {
  const c = await context(false);
  if (c.error || !c.supabase) return { clinic: null, professionals: [], settings: defaults, error: c.error };
  const queries = await Promise.all([
    c.supabase.from("clinics").select("*").eq("id", c.clinicId).maybeSingle(),
    c.supabase.from("clinic_members").select("user_id,role,status").eq("clinic_id", c.clinicId).eq("status", "active").in("role", ["doctor", "clinic_admin"]),
    c.supabase.from("clinic_settings").select("*").eq("clinic_id", c.clinicId).maybeSingle(),
    c.supabase.from("document_settings").select("*").eq("clinic_id", c.clinicId).maybeSingle(),
    c.supabase.from("schedule_settings").select("*").eq("clinic_id", c.clinicId).maybeSingle(),
    c.supabase.from("ai_settings").select("*").eq("clinic_id", c.clinicId).maybeSingle(),
  ]);
  const sections: SettingsSection[] = ["clinic", "professional", "clinic", "documents", "schedule", "ai"];
  const failed = queries.findIndex((query) => query.error);
  if (failed >= 0) return { clinic: null, professionals: [], settings: defaults, ...settingsError(sections[failed], queries[failed].error) };
  const [clinicResult, membersResult, clinicSettingsResult, documentResult, scheduleResult, aiResult] = queries;
  const members = membersResult.data ?? [];
  const ids = members.map((member) => member.user_id);
  const [profilesResult, professionalResult] = await Promise.all([
    ids.length ? c.supabase.from("profiles").select("id,full_name,email,phone").in("id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? c.supabase.from("professional_profiles").select("*").eq("clinic_id", c.clinicId).in("user_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || professionalResult.error) return { clinic: null, professionals: [], settings: defaults, ...settingsError("professional", profilesResult.error ?? professionalResult.error) };
  const clinic = clinicResult.data as Record<string, unknown> | null;
  let logoPreviewUrl = "";
  const logoPath = typeof clinic?.logo_url === "string" ? clinic.logo_url : "";
  if (logoPath) {
    if (logoPath.startsWith("http")) logoPreviewUrl = logoPath;
    else {
      const signed = await c.supabase.storage.from("clinic-assets").createSignedUrl(logoPath, 3600);
      if (signed.error) settingsError("logo", signed.error);
      logoPreviewUrl = signed.data?.signedUrl ?? "";
    }
  }
  return {
    clinic: clinic ? { ...clinic, logo_preview_url: logoPreviewUrl } : null,
    professionals: members.map((member) => ({ ...member, profile: profilesResult.data?.find((p) => p.id === member.user_id) ?? null, professional: professionalResult.data?.find((p) => p.user_id === member.user_id) ?? null })),
    settings: { clinic: clinicSettingsResult.data, document: { ...defaults.document, ...(documentResult.data ?? {}) }, schedule: { ...defaults.schedule, ...(scheduleResult.data ?? {}) }, ai: { ...defaults.ai, ...(aiResult.data ?? {}) } },
    error: null,
  };
}

export async function saveClinicSettings(input: unknown) {
  const parsed = clinicSchema.safeParse(input);
  if (!parsed.success) return { error: `VALIDATION_ERROR: ${parsed.error.issues[0]?.message ?? "Dados inválidos."}` };
  const c = await context(true); if (c.error || !c.supabase) return { error: c.error };
  const value = parsed.data;
  const previous = await c.supabase.from("clinics").select("logo_url").eq("id", c.clinicId).maybeSingle();
  if (previous.error) return settingsError("clinic", previous.error);
  const payload = { ...value, legal_name: nil(value.legal_name), cnpj: nil(value.cnpj), cnes: nil(value.cnes), logo_url: nil(value.logo_url), phone: nil(value.phone), whatsapp: nil(value.whatsapp), email: nil(value.email), website: nil(value.website), instagram: nil(value.instagram), favicon_url: nil(value.favicon_url), zip_code: nil(value.zip_code), address: nil(value.address), address_number: nil(value.address_number), address_complement: nil(value.address_complement), neighborhood: nil(value.neighborhood), city: nil(value.city), state: nil(value.state)?.toUpperCase() ?? null };
  const { data, error } = await c.supabase.from("clinics").update(payload).eq("id", c.clinicId).select("id").maybeSingle();
  if (error) return settingsError("clinic", error); if (!data) return settingsError("clinic", { code: "PGRST116", message: "A clínica ativa não foi atualizada. Verifique a policy RLS." });
  const oldLogo = previous.data?.logo_url;
  if (oldLogo && oldLogo !== payload.logo_url && oldLogo.startsWith(`clinics/${c.clinicId}/logo/`)) {
    const cleanup = await c.supabase.storage.from("clinic-assets").remove([oldLogo]);
    if (cleanup.error) settingsError("logo", cleanup.error);
  }
  revalidatePath("/configuracoes/clinica"); revalidatePath("/configuracoes/identidade");
  return { success: "Dados da clínica salvos." };
}

export async function saveProfessionalProfile(input: unknown) {
  const parsed = professionalSchema.safeParse(input); if (!parsed.success) return { error: `VALIDATION_ERROR: ${parsed.error.issues[0]?.message ?? "Dados inválidos."}` };
  const c = await context(false); if (c.error || !c.supabase) return { error: c.error };
  if (parsed.data.user_id !== c.userId && c.role !== "clinic_admin" && c.role !== "platform_admin") return { error: "42501: Somente administradores podem editar outro profissional." };
  const v = parsed.data;
  const payload = { clinic_id: c.clinicId, ...v, updated_by: c.userId, professional_name: nil(v.professional_name), profession: nil(v.profession), council: nil(v.council), council_number: nil(v.council_number), council_state: nil(v.council_state)?.toUpperCase() ?? null, specialty: nil(v.specialty), sub_specialty: nil(v.sub_specialty), rqe: nil(v.rqe), phone: nil(v.phone), email: nil(v.email), photo_url: nil(v.photo_url), signature_url: nil(v.signature_url), stamp_url: nil(v.stamp_url) };
  const { data, error } = await c.supabase.from("professional_profiles").upsert(payload, { onConflict: "clinic_id,user_id" }).select("id").maybeSingle();
  if (error) return settingsError("professional", error); if (!data) return settingsError("professional", { code: "PGRST116", message: "O perfil profissional não foi salvo. Verifique a policy RLS." });
  revalidatePath("/configuracoes/profissionais"); return { success: "Perfil profissional salvo." };
}

export async function saveSettings(kind: "document_settings" | "schedule_settings" | "ai_settings", input: unknown) {
  const config = kind === "schedule_settings" ? { schema: scheduleSchema, section: "schedule" as const, route: "agenda" } : kind === "document_settings" ? { schema: documentSchema, section: "documents" as const, route: "documentos" } : { schema: aiSchema, section: "ai" as const, route: "ia" };
  const parsed = config.schema.safeParse(input); if (!parsed.success) return { error: `VALIDATION_ERROR: ${parsed.error.issues[0]?.message ?? "Dados inválidos."}` };
  const c = await context(true); if (c.error || !c.supabase) return { error: c.error };
  const { data, error } = await c.supabase.from(kind).upsert({ clinic_id: c.clinicId, ...parsed.data, updated_by: c.userId }, { onConflict: "clinic_id" }).select("clinic_id").maybeSingle();
  if (error) return settingsError(config.section, error); if (!data) return settingsError(config.section, { code: "PGRST116", message: "A configuração não foi salva. Verifique a policy RLS." });
  revalidatePath(`/configuracoes/${config.route}`); return { success: "Configuração salva com sucesso." };
}

export async function createClinicAssetUpload(filename: string, contentType: string, size: number) {
  const c = await context(true); if (c.error || !c.supabase) return { error: c.error };
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) return { error: "VALIDATION_ERROR: Use uma imagem JPG, PNG ou WebP." };
  if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) return { error: "VALIDATION_ERROR: A logomarca deve ter no máximo 5 MB." };
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const safe = filename.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "logo";
  const path = `clinics/${c.clinicId}/logo/${crypto.randomUUID()}-${safe}.${extension}`;
  const { data, error } = await c.supabase.storage.from("clinic-assets").createSignedUploadUrl(path);
  if (error || !data) return settingsError("logo", error);
  return { path, token: data.token };
}

export async function getClinicAssetPreview(path: string) {
  const c = await context(false); if (c.error || !c.supabase) return { error: c.error };
  if (!path.startsWith(`clinics/${c.clinicId}/logo/`)) return { error: "42501: Arquivo inválido para a clínica ativa." };
  const { data, error } = await c.supabase.storage.from("clinic-assets").createSignedUrl(path, 3600);
  if (error || !data) return settingsError("logo", error); return { signedUrl: data.signedUrl };
}

export async function saveClinicLogo(path: string) {
  const c = await context(true); if (c.error || !c.supabase) return { error: c.error };
  if (!path.startsWith(`clinics/${c.clinicId}/logo/`)) return { error: "42501: Arquivo inválido para a clínica ativa." };
  const existing = await c.supabase.storage.from("clinic-assets").list(`clinics/${c.clinicId}/logo`, { search: path.split("/").at(-1), limit: 1 });
  if (existing.error) return settingsError("logo", existing.error);
  if (!existing.data.some((file) => path.endsWith(`/${file.name}`))) return settingsError("logo", { code: "404", message: "A logomarca enviada não foi encontrada no Storage." });
  const previous = await c.supabase.from("clinics").select("logo_url").eq("id", c.clinicId).maybeSingle();
  if (previous.error) return settingsError("logo", previous.error);
  const updated = await c.supabase.from("clinics").update({ logo_url: path }).eq("id", c.clinicId).select("id").maybeSingle();
  if (updated.error) return settingsError("logo", updated.error);
  if (!updated.data) return settingsError("logo", { code: "PGRST116", message: "A logomarca não foi vinculada à clínica ativa." });
  const oldLogo = previous.data?.logo_url;
  if (oldLogo && oldLogo !== path && oldLogo.startsWith(`clinics/${c.clinicId}/logo/`)) {
    const cleanup = await c.supabase.storage.from("clinic-assets").remove([oldLogo]);
    if (cleanup.error) settingsError("logo", cleanup.error);
  }
  const preview = await c.supabase.storage.from("clinic-assets").createSignedUrl(path, 3600);
  if (preview.error || !preview.data) return settingsError("logo", preview.error);
  revalidatePath("/configuracoes/clinica"); revalidatePath("/configuracoes/identidade");
  return { success: "Logomarca salva.", signedUrl: preview.data.signedUrl };
}

export async function removeClinicAsset(path: string) {
  const c = await context(true); if (c.error || !c.supabase) return { error: c.error };
  const isLegacyUrl = path.startsWith("http://") || path.startsWith("https://");
  if (!isLegacyUrl && !path.startsWith(`clinics/${c.clinicId}/logo/`)) return { error: "42501: Arquivo inválido para a clínica ativa." };
  if (!isLegacyUrl) { const removed = await c.supabase.storage.from("clinic-assets").remove([path]); if (removed.error) return settingsError("logo", removed.error); }
  const updated = await c.supabase.from("clinics").update({ logo_url: null }).eq("id", c.clinicId).select("id");
  if (updated.error) return settingsError("logo", updated.error); revalidatePath("/configuracoes/clinica"); revalidatePath("/configuracoes/identidade");
  return { success: "Logomarca removida." };
}
