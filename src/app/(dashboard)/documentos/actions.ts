"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { clinicalDocumentTypes, type ClinicalDocument, type ClinicalDocumentType, type OfficialClinicalDocumentSnapshot, type PrescriptionItem } from "@/lib/clinical-documents/types";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
type DatabaseError = { message?: string; details?: string; hint?: string; code?: string } | null;

function visibleError(error: DatabaseError, fallback: string) {
  return `${error?.code ?? "SEM_CODIGO"}: ${error?.message ?? fallback}`;
}

function logDocumentError(section: string, error: DatabaseError) {
  console.error("ASTER_DOCUMENT_ISSUE_ERROR", {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    section,
  });
  return { error: visibleError(error, "Não foi possível concluir a operação no documento.") };
}

function logDocumentLogoError(logoPath: string | null, logoUrl: string | null, error: DatabaseError) {
  console.error("ASTER_DOCUMENT_LOGO_ERROR", {
    logoPath,
    hasSignedUrl: Boolean(logoUrl),
    message: error?.message,
    code: error?.code,
  });
}

async function context() {
  const supabase = await createClient();
  const failure = (error: string) => ({ supabase: null, userId: "", clinicId: "", role: "", error });
  if (!supabase) return failure("SEM_CODIGO: Supabase não configurado.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) return failure(logDocumentError("auth", authError).error);
  if (!auth.user) return failure("SEM_CODIGO: Sessão expirada.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (profileError) return failure(logDocumentError("profile", profileError).error);
  if (!profile?.active_clinic_id) return failure("SEM_CODIGO: Selecione uma clínica ativa.");
  const { data: member, error: memberError } = await supabase.from("clinic_members").select("role,status").eq("clinic_id", profile.active_clinic_id).eq("user_id", auth.user.id).maybeSingle();
  if (memberError) return failure(logDocumentError("membership", memberError).error);
  if (!member || member.status !== "active") return failure("42501: Sem vínculo ativo com a clínica.");
  return { supabase, userId: auth.user.id, clinicId: profile.active_clinic_id as string, role: member.role as string, error: null };
}

function refresh(appointmentId: string, id?: string) {
  revalidatePath(`/consultas/${appointmentId}/documentos`);
  revalidatePath(`/consultas/${appointmentId}/prontuario`);
  if (id) { revalidatePath(`/documentos/${id}`); revalidatePath(`/documentos/${id}/imprimir`); }
}

export async function listAppointmentDocuments(appointmentId: string) {
  if (!uuid.safeParse(appointmentId).success) return { documents: [] as ClinicalDocument[], error: "VALIDATION_ERROR: Consulta inválida." };
  const c = await context(); if (c.error || !c.supabase) return { documents: [] as ClinicalDocument[], error: c.error };
  const { data, error } = await c.supabase.from("clinical_documents").select("*").eq("clinic_id", c.clinicId).eq("appointment_id", appointmentId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) return { documents: [] as ClinicalDocument[], ...logDocumentError("history", error) };
  return { documents: (data ?? []) as ClinicalDocument[], error: null };
}

export async function createClinicalDocument(appointmentId: string, type: ClinicalDocumentType) {
  if (!uuid.safeParse(appointmentId).success || !clinicalDocumentTypes.includes(type)) return { error: "VALIDATION_ERROR: Dados inválidos." };
  const c = await context(); if (c.error || !c.supabase) return { error: c.error };
  const appointmentResult = await c.supabase.from("appointments").select("id,clinic_id,patient_id,professional_id").eq("id", appointmentId).eq("clinic_id", c.clinicId).maybeSingle();
  if (appointmentResult.error) return logDocumentError("appointment", appointmentResult.error);
  const appointment = appointmentResult.data;
  if (!appointment) return { error: "PGRST116: Consulta não encontrada na clínica ativa." };
  if (appointment.professional_id !== c.userId) return { error: "42501: Somente o profissional responsável pode criar documentos." };
  const recordResult = await c.supabase.from("medical_records").select("id").eq("appointment_id", appointmentId).eq("clinic_id", c.clinicId).is("deleted_at", null).maybeSingle();
  if (recordResult.error) return logDocumentError("medical_record", recordResult.error);
  const title = ({ prescription: "Receita simples", special_prescription: "Receita de controle especial", medical_certificate: "Atestado médico", attendance_declaration: "Declaração de comparecimento", exam_request: "Solicitação de exames", referral: "Encaminhamento", patient_guidance: "Orientações ao paciente" } as Record<ClinicalDocumentType, string>)[type];
  const { data, error } = await c.supabase.from("clinical_documents").insert({
    clinic_id: c.clinicId, patient_id: appointment.patient_id, appointment_id: appointment.id,
    medical_record_id: recordResult.data?.id ?? null, professional_id: appointment.professional_id,
    created_by: c.userId, document_type: type, title, content: { text: "" }, status: "draft",
  }).select("id,status").single();
  if (error || !data) return logDocumentError("create_draft", error);
  refresh(appointmentId, data.id); return { id: data.id };
}

export async function getClinicalDocument(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const c = await context(); if (c.error || !c.supabase) return null;
  const documentResult = await c.supabase.from("clinical_documents").select("*, patient:patients(full_name,social_name,cpf,birth_date)").eq("id", id).eq("clinic_id", c.clinicId).is("deleted_at", null).maybeSingle();
  if (documentResult.error) { logDocumentError("load_document", documentResult.error); return null; }
  const data = documentResult.data; if (!data) return null;
  const snapshot = data.snapshot_json as OfficialClinicalDocumentSnapshot | null;
  if (data.status !== "draft" && snapshot) {
    const audit = await c.supabase.rpc("record_clinical_document_access", {
      target_document_id: id,
      access_event: "viewed",
    });
    if (audit.error) logDocumentError("audit_view", audit.error);
    const snapshotLogoPath = snapshot.clinic?.logo_url ?? null;
    let snapshotLogoUrl: string | null = null;
    if (snapshotLogoPath?.startsWith("http://") || snapshotLogoPath?.startsWith("https://")) {
      snapshotLogoUrl = snapshotLogoPath;
    } else if (snapshotLogoPath?.startsWith(`clinics/${c.clinicId}/logo/`)) {
      const signed = await c.supabase.storage.from("clinic-assets").createSignedUrl(snapshotLogoPath, 3600);
      snapshotLogoUrl = signed.data?.signedUrl ?? null;
      if (signed.error) logDocumentLogoError(snapshotLogoPath, snapshotLogoUrl, signed.error);
    }
    return {
      ...data,
      snapshot_json: snapshot,
      patient: {
        full_name: snapshot.patient?.legal_name ?? snapshot.patient?.name ?? "Paciente",
        social_name: snapshot.patient?.name ?? null,
        cpf: snapshot.patient?.cpf ?? null,
        birth_date: snapshot.patient?.birth_date ?? null,
      },
      professional: {
        full_name: snapshot.professional?.legal_name ?? snapshot.professional?.name ?? null,
        professional_name: snapshot.professional?.name ?? null,
        profession: snapshot.professional?.profession ?? null,
        council: snapshot.professional?.council ?? null,
        council_number: snapshot.professional?.council_number ?? null,
        council_state: snapshot.professional?.council_state ?? null,
        specialty: snapshot.professional?.specialty ?? null,
        rqe: snapshot.professional?.rqe ?? null,
        signature_url: null,
        stamp_url: null,
      },
      clinic: {
        name: snapshot.clinic?.name ?? "Clínica",
        legal_name: snapshot.clinic?.legal_name ?? null,
        cnpj: snapshot.clinic?.cnpj ?? null,
        email: snapshot.clinic?.email ?? null,
        phone: snapshot.clinic?.phone ?? null,
        whatsapp: snapshot.clinic?.whatsapp ?? null,
        address: snapshot.clinic?.address ?? null,
        address_number: snapshot.clinic?.address_number ?? null,
        address_complement: snapshot.clinic?.address_complement ?? null,
        neighborhood: snapshot.clinic?.neighborhood ?? null,
        city: snapshot.clinic?.city ?? null,
        state: snapshot.clinic?.state ?? null,
        zip_code: snapshot.clinic?.zip_code ?? null,
        logo_path: snapshotLogoPath,
        logo_url: snapshotLogoUrl,
      },
      document_settings: snapshot.document_settings ?? null,
      items: snapshot.prescription?.items ?? [],
    } as ClinicalDocument;
  }
  const [profileResult, professionalResult, clinicResult, itemsResult, settingsResult] = await Promise.all([
    c.supabase.from("profiles").select("full_name").eq("id", data.professional_id).maybeSingle(),
    c.supabase.from("professional_profiles").select("professional_name,profession,council,council_number,council_state,specialty,rqe,signature_url,stamp_url").eq("clinic_id", c.clinicId).eq("user_id", data.professional_id).maybeSingle(),
    c.supabase.from("clinics").select("name,legal_name,cnpj,email,phone,whatsapp,address,address_number,address_complement,neighborhood,city,state,zip_code,logo_url").eq("id", c.clinicId).maybeSingle(),
    c.supabase.from("prescription_items").select("*").eq("clinic_id", c.clinicId).eq("document_id", id).order("sort_order"),
    c.supabase.from("document_settings").select("header_text,footer_text,signature_text,show_logo,show_cnpj,show_address,show_phone,show_email,show_council,show_specialty,show_rqe,physical_signature_space").eq("clinic_id", c.clinicId).maybeSingle(),
  ]);
  const relatedError = profileResult.error ?? professionalResult.error ?? clinicResult.error ?? itemsResult.error ?? settingsResult.error;
  if (relatedError) logDocumentError("document_header", relatedError);
  const clinic = clinicResult.data;
  let signedLogoUrl: string | null = null;
  if (clinic?.logo_url) {
    if (clinic.logo_url.startsWith("http://") || clinic.logo_url.startsWith("https://")) signedLogoUrl = clinic.logo_url;
    else if (clinic.logo_url.startsWith(`clinics/${c.clinicId}/logo/`)) {
      const signed = await c.supabase.storage.from("clinic-assets").createSignedUrl(clinic.logo_url, 3600);
      signedLogoUrl = signed.data?.signedUrl ?? null;
      if (signed.error || !signedLogoUrl) logDocumentLogoError(clinic.logo_url, signedLogoUrl, signed.error);
    } else {
      logDocumentLogoError(clinic.logo_url, null, { code: "INVALID_LOGO_PATH", message: "O path salvo não pertence à clínica ativa." });
    }
  }
  return {
    ...data,
    patient: Array.isArray(data.patient) ? data.patient[0] : data.patient,
    professional: { full_name: profileResult.data?.full_name ?? null, ...professionalResult.data },
    clinic: clinic ? { ...clinic, logo_path: clinic.logo_url, logo_url: signedLogoUrl } : null,
    document_settings: settingsResult.data,
    items: itemsResult.data ?? [],
  } as ClinicalDocument;
}

export async function saveClinicalDocument(id: string, title: string, content: Record<string, string | boolean>, items: PrescriptionItem[]) {
  if (!uuid.safeParse(id).success) return { error: "VALIDATION_ERROR: Documento inválido." };
  const c = await context(); if (c.error || !c.supabase) return { error: c.error };
  const documentResult = await c.supabase.from("clinical_documents").select("id,appointment_id,status,professional_id").eq("id", id).eq("clinic_id", c.clinicId).maybeSingle();
  if (documentResult.error) return logDocumentError("load_draft", documentResult.error);
  const doc = documentResult.data;
  if (!doc) return { error: "PGRST116: Documento não encontrado." };
  if (doc.status !== "draft") return { error: "42501: Documento emitido não pode ser alterado." };
  if (doc.professional_id !== c.userId) return { error: "42501: Sem permissão para editar." };
  const updated = await c.supabase.from("clinical_documents").update({ title: title.trim(), content }).eq("id", id).eq("status", "draft").select("id").maybeSingle();
  if (updated.error) return logDocumentError("save_draft", updated.error);
  if (!updated.data) return logDocumentError("save_draft", { code: "PGRST116", message: "O rascunho não foi atualizado." });
  const removed = await c.supabase.from("prescription_items").delete().eq("clinic_id", c.clinicId).eq("document_id", id);
  if (removed.error) return logDocumentError("delete_items", removed.error);
  if (items.length) {
    const inserted = await c.supabase.from("prescription_items").insert(items.map((item, index) => ({ ...item, id: undefined, clinic_id: c.clinicId, document_id: id, sort_order: index })));
    if (inserted.error) return logDocumentError("save_items", inserted.error);
  }
  refresh(doc.appointment_id, id); return { success: "Rascunho salvo." };
}

export async function issueClinicalDocument(id: string) {
  if (!uuid.safeParse(id).success) return { error: "VALIDATION_ERROR: Documento inválido." };
  const c = await context(); if (c.error || !c.supabase) return { error: c.error };
  const before = await c.supabase.from("clinical_documents").select("appointment_id,status,professional_id").eq("id", id).eq("clinic_id", c.clinicId).maybeSingle();
  if (before.error) return logDocumentError("load_before_issue", before.error);
  if (!before.data) return { error: "PGRST116: Documento não encontrado." };
  if (before.data.professional_id !== c.userId) return { error: "42501: Somente o profissional responsável pode emitir o documento." };
  const issued = await c.supabase.rpc("issue_clinical_document", { target_document_id: id });
  if (issued.error) return logDocumentError("issue", issued.error);
  const confirmation = await c.supabase.from("clinical_documents").select("status,issued_at").eq("id", id).eq("clinic_id", c.clinicId).maybeSingle();
  if (confirmation.error) return logDocumentError("confirm_issue", confirmation.error);
  if (confirmation.data?.status !== "finalized" || !confirmation.data.issued_at) return logDocumentError("confirm_issue", { code: "DOCUMENT_NOT_FINALIZED", message: "A emissão não finalizou o documento oficial." });
  refresh(before.data.appointment_id, id); return { success: "Documento emitido." };
}

export async function cancelClinicalDocument(id: string, reason: string) {
  const c = await context(); if (c.error || !c.supabase) return { error: c.error };
  const doc = await c.supabase.from("clinical_documents").select("appointment_id").eq("id", id).eq("clinic_id", c.clinicId).maybeSingle();
  if (doc.error) return logDocumentError("load_before_cancel", doc.error); if (!doc.data) return { error: "PGRST116: Documento não encontrado." };
  const cancelled = await c.supabase.rpc("cancel_clinical_document", { target_document_id: id, reason });
  if (cancelled.error) return logDocumentError("cancel", cancelled.error); refresh(doc.data.appointment_id, id); return { success: "Documento cancelado sem apagar o histórico." };
}

export async function markDocumentPrinted(id: string) {
  const c = await context(); if (c.error || !c.supabase) return;
  const result = await c.supabase.rpc("mark_clinical_document_printed", { target_document_id: id });
  if (result.error) logDocumentError("print", result.error);
}

export async function savePrescriptionFavorite(documentId: string, name: string) {
  if (!uuid.safeParse(documentId).success || !name.trim()) return { error: "VALIDATION_ERROR: Informe um nome para o modelo." };
  const c = await context(); if (c.error || !c.supabase) return { error: c.error };
  const doc = await getClinicalDocument(documentId); if (!doc || !(["prescription", "special_prescription"] as string[]).includes(doc.document_type)) return { error: "PGRST116: Receita não encontrada." };
  const result = await c.supabase.from("favorite_prescriptions").upsert({ clinic_id: c.clinicId, professional_id: c.userId, name: name.trim(), document_type: doc.document_type, content: doc.content, items: doc.items ?? [] }, { onConflict: "clinic_id,professional_id,name" });
  return result.error ? logDocumentError("favorite", result.error) : { success: "Modelo favorito salvo." };
}
