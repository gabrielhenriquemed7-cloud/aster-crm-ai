"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  medicalRecordSchema,
  type MedicalRecordFormValues,
} from "@/lib/medical-records/schema";
import type {
  MedicalRecord,
  MedicalRecordAppointment,
  MedicalRecordHistoryItem,
} from "@/lib/medical-records/types";
import { generateOfficialClinicalDocumentPdf } from "@/lib/clinical-documents/official-pdf-generator";
import type { OfficialClinicalDocumentSnapshot } from "@/lib/clinical-documents/types";
import { buildPrescriptionPresentation } from "@/lib/prescription-engine/presentation";
import type { PrescriptionDocument } from "@/lib/prescription-engine/types";
import { createClient } from "@/lib/supabase/server";
import { onConsultationAutosaved } from "@/lib/consultations/events";
import { onConsultationAddendumCreated, onConsultationFinalizationFailed, onConsultationFinalizationRequested, onConsultationFinalized } from "@/lib/consultations/events";

type SaveResult = { error?: string; id?: string; success?: string; version?: number };
const idSchema = z.string().uuid();
const prescriptionMedicationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(500),
  activeIngredient: z.string().max(500),
  concentration: z.string().max(300),
  pharmaceuticalForm: z.string().max(500),
  route: z.string().max(300),
  dose: z.string().max(300),
  frequency: z.string().max(300),
  interval: z.string().max(300),
  schedule: z.string().max(500),
  duration: z.string().max(300),
  quantity: z.string().max(300),
  notes: z.string().max(4000),
  posologyMode: z.enum([
    "single_use",
    "continuous",
    "as_needed",
    "alternate_days",
    "custom_schedule",
  ]),
}).passthrough();
const prescriptionDraftSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "simple",
    "continuous",
    "antimicrobial",
    "special_control",
    "digital",
  ]),
  medications: z.array(prescriptionMedicationSchema).max(100),
  orientations: z.string().max(12000),
  observations: z.string().max(12000),
});

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function recordPayload(values: MedicalRecordFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, nullable(value)]),
  );
}

async function context() {
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
    .select("id, role")
    .eq("clinic_id", profile.active_clinic_id)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership)
    return {
      error:
        "Seu usuário não possui vínculo ativo com a clínica selecionada." as const,
    };
  return {
    supabase,
    userId: auth.user.id,
    clinicId: profile.active_clinic_id,
    role: membership.role as string,
    error: null,
  };
}

export async function getMedicalRecordPageData(appointmentId: string) {
  if (!idSchema.safeParse(appointmentId).success) return null;
  const current = await context();
  if (current.error)
    return {
      error: current.error,
      appointment: null,
      record: null,
      canEdit: false,
    };

  const { data: appointment, error: appointmentError } = await current.supabase
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, professional_id, title, appointment_date, start_time, appointment_type, status, consultation_started_at, patient:patients(id, full_name, social_name, birth_date, created_at, gender, cpf, phone, insurance, insurance_card, photo_url, allergies, continuous_medications, medical_history)",
    )
    .eq("id", appointmentId)
    .eq("clinic_id", current.clinicId)
    .maybeSingle();
  if (appointmentError) {
    console.error("medical record appointment load failed", {
      message: appointmentError.message,
      details: appointmentError.details,
      hint: appointmentError.hint,
      code: appointmentError.code,
    });
    return {
      error: "Não foi possível carregar os dados da consulta.",
      appointment: null,
      record: null,
      canEdit: false,
    };
  }
  if (!appointment) return null;

  const [
    { data: professional },
    { data: record, error: recordError },
    { data: historyRecords, error: historyError },
    { data: aiSettings, error: aiSettingsError },
    { data: longitudinalSummary },
  ] = await Promise.all([
    current.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", appointment.professional_id)
      .maybeSingle(),
    current.supabase
      .from("medical_records")
      .select("*")
      .eq("appointment_id", appointmentId)
      .is("deleted_at", null)
      .maybeSingle(),
    current.supabase
      .from("medical_records")
      .select("*")
      .eq("clinic_id", current.clinicId)
      .eq("patient_id", appointment.patient_id)
      .neq("appointment_id", appointmentId)
      .is("deleted_at", null),
    current.supabase
      .from("ai_settings")
      .select("enabled")
      .eq("clinic_id", current.clinicId)
      .maybeSingle(),
    current.supabase
      .from("longitudinal_clinical_summaries")
      .select(
        "id,patient_id,generated_at,last_record_at,records_count,model,schema_version,summary,sources,status",
      )
      .eq("clinic_id", current.clinicId)
      .eq("patient_id", appointment.patient_id)
      .maybeSingle(),
  ]);
  if (recordError || historyError) {
    const loadError = recordError ?? historyError;
    console.error("medical record load failed", {
      message: loadError?.message,
      details: loadError?.details,
      hint: loadError?.hint,
      code: loadError?.code,
    });
    return {
      error: "Não foi possível carregar o prontuário.",
      appointment: null,
      record: null,
      canEdit: false,
    };
  }

  if (aiSettingsError) {
    console.error("ASTER_COPILOT_SETTINGS_ERROR", {
      code: aiSettingsError.code,
      message: aiSettingsError.message,
      hasAuthenticatedUser: true,
      hasActiveClinic: true,
    });
  }

  const normalizedAppointment = {
    ...appointment,
    patient: Array.isArray(appointment.patient)
      ? (appointment.patient[0] ?? null)
      : appointment.patient,
    professional,
  } as MedicalRecordAppointment;

  const historyAppointmentIds = (historyRecords ?? []).map(
    (item) => item.appointment_id,
  );
  const { data: historyAppointments, error: appointmentsHistoryError } =
    historyAppointmentIds.length
      ? await current.supabase
          .from("appointments")
          .select("id, appointment_date, start_time, title, professional_id")
          .in("id", historyAppointmentIds)
          .eq("clinic_id", current.clinicId)
      : { data: [], error: null };
  if (appointmentsHistoryError)
    return {
      error: "Não foi possível carregar o histórico do paciente.",
      appointment: null,
      record: null,
      history: [],
      canEdit: false,
    };
  const previousAppointments = (historyAppointments ?? []).filter(
    (item) =>
      item.appointment_date < appointment.appointment_date ||
      (item.appointment_date === appointment.appointment_date &&
        item.start_time < appointment.start_time),
  );
  const professionalIds = [
    ...new Set(previousAppointments.map((item) => item.professional_id)),
  ];
  const { data: historyProfessionals } = professionalIds.length
    ? await current.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", professionalIds)
    : { data: [] };
  const appointmentMap = new Map(
    previousAppointments.map((item) => [item.id, item]),
  );
  const professionalMap = new Map(
    (historyProfessionals ?? []).map((item) => [item.id, item.full_name]),
  );
  const history = (historyRecords ?? [])
    .flatMap((item) => {
      const source = appointmentMap.get(item.appointment_id);
      if (!source) return [];
      return [
        {
          ...item,
          appointment_date: source.appointment_date,
          start_time: source.start_time,
          title: source.title,
          professional_name:
            professionalMap.get(source.professional_id) ?? "Profissional",
        } as MedicalRecordHistoryItem,
      ];
    })
    .sort((a, b) =>
      `${b.appointment_date} ${b.start_time}`.localeCompare(
        `${a.appointment_date} ${a.start_time}`,
      ),
    );
  const { data: patientDocuments } = await current.supabase
    .from("clinical_documents")
    .select("id, appointment_id, title, document_type, status, issued_at, created_at")
    .eq("clinic_id", current.clinicId)
    .eq("patient_id", appointment.patient_id)
    .in("status", ["finalized", "signed", "archived", "cancelled"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const { data: addenda } = record?.id
    ? await current.supabase.from("medical_record_addenda").select("id,content,reason,created_by,created_at").eq("medical_record_id", record.id).order("created_at", { ascending: false })
    : { data: [] };
  const [
    { data: scoreResults },
    { data: professionalProfile },
    { data: clinicIdentity },
  ] = await Promise.all([
    current.supabase
      .from("clinical_score_results")
      .select("id, score, result, calculated_at, score_version")
      .eq("clinic_id", current.clinicId)
      .eq("appointment_id", appointmentId)
      .order("calculated_at", { ascending: false }),
    current.supabase
      .from("professional_profiles")
      .select(
        "professional_name, council, council_number, council_state, specialty",
      )
      .eq("clinic_id", current.clinicId)
      .eq("user_id", appointment.professional_id)
      .maybeSingle(),
    current.supabase
      .from("clinics")
      .select("name, legal_name, logo_url, phone, email")
      .eq("id", current.clinicId)
      .maybeSingle(),
  ]);
  let clinicLogoUrl: string | null = null;
  if (clinicIdentity?.logo_url) {
    if (/^https?:\/\//.test(clinicIdentity.logo_url)) {
      clinicLogoUrl = clinicIdentity.logo_url;
    } else {
      const { data: signedLogo } = await current.supabase.storage
        .from("clinic-assets")
        .createSignedUrl(clinicIdentity.logo_url, 3600);
      clinicLogoUrl = signedLogo?.signedUrl ?? null;
    }
  }

  return {
    error: null,
    appointment: normalizedAppointment,
    record: (record as MedicalRecord | null) ?? null,
    history,
    patientDocuments: patientDocuments ?? [],
    addenda: addenda ?? [],
    scoreResults: scoreResults ?? [],
    professionalProfile: professionalProfile ?? null,
    clinicIdentity: clinicIdentity
      ? { ...clinicIdentity, logo_url: clinicLogoUrl }
      : null,
    canEdit:
      appointment.professional_id === current.userId &&
      appointment.status === "in_progress" &&
      (!record || record.status === "draft"),
    aiEnabled: Boolean(aiSettings?.enabled),
    canManageAi:
      current.role === "clinic_admin" || current.role === "platform_admin",
    longitudinalSummary: longitudinalSummary
      ? {
          ...longitudinalSummary,
          has_new_records: (historyRecords ?? []).some(
            (item) =>
              !longitudinalSummary.last_record_at ||
              item.updated_at > longitudinalSummary.last_record_at,
          ),
        }
      : null,
  };
}

export async function saveMedicalRecord(
  appointmentId: string,
  values: MedicalRecordFormValues,
  lockToken?: string,
): Promise<SaveResult> {
  if (!idSchema.safeParse(appointmentId).success)
    return { error: "Consulta inválida." };
  const parsed = medicalRecordSchema.safeParse(values);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Dados clínicos inválidos.",
    };
  const current = await context();
  if (current.error) return { error: current.error };

  const { data: appointment } = await current.supabase
    .from("appointments")
    .select("id, patient_id, professional_id, status")
    .eq("id", appointmentId)
    .eq("clinic_id", current.clinicId)
    .maybeSingle();
  if (!appointment)
    return { error: "Consulta não encontrada na clínica ativa." };
  if (appointment.professional_id !== current.userId)
    return {
      error: "Somente o profissional da consulta pode salvar o prontuário.",
    };
  if (appointment.status !== "in_progress")
    return { error: "O prontuário só pode ser editado durante o atendimento." };

  const { data: existing, error: lookupError } = await current.supabase
    .from("medical_records")
    .select("id, status")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError)
    return { error: "Não foi possível verificar o prontuário da consulta." };
  if (existing && existing.status !== "draft")
    return {
      error:
        "Este prontuário foi finalizado e está disponível apenas para leitura.",
    };

  if (!lockToken || !idSchema.safeParse(lockToken).success)
    return { error: "A sessão de edição expirou. Reabra a consulta para continuar." };
  const payload = recordPayload(parsed.data);
  const result = await current.supabase.rpc("autosave_consultation_draft", {
    target_appointment_id: appointmentId,
    lock_token: lockToken,
    draft: payload,
  });

  if (result.error || result.data === null) {
    console.error("medical record save failed", {
      message: result.error?.message,
      details: result.error?.details,
      hint: result.error?.hint,
      code: result.error?.code,
    });
    return { error: "Não foi possível salvar o prontuário." };
  }

  revalidatePath(`/consultas/${appointmentId}/prontuario`);
  revalidatePath(`/consultas/${appointmentId}`);
  revalidatePath(`/appointments/${appointmentId}`);
  await onConsultationAutosaved({ appointmentId, patientId: appointment.patient_id ?? "", actorId: current.userId, occurredAt: new Date().toISOString(), autosaveVersion: Number(result.data) });
  return { success: "Prontuário salvo com sucesso.", id: existing?.id, version: Number(result.data) };
}

export async function renewConsultationLock(appointmentId: string, lockToken: string) {
  if (!idSchema.safeParse(appointmentId).success || !idSchema.safeParse(lockToken).success) return { error: "Sessão inválida." };
  const current = await context(); if (current.error) return { error: current.error };
  const { data, error } = await current.supabase.rpc("renew_consultation_lock", { target_appointment_id: appointmentId, lock_token: lockToken });
  if (error) return { error: error.message || "Não foi possível renovar a sessão de edição." };
  return { lockUntil: data as string };
}

export async function savePrescriptionDraft(
  appointmentId: string,
  draft: unknown,
): Promise<SaveResult> {
  if (!idSchema.safeParse(appointmentId).success)
    return { error: "Consulta inválida." };
  const parsed = prescriptionDraftSchema.safeParse(draft);
  if (!parsed.success)
    return { error: "O rascunho estruturado da Prescrição é inválido." };
  const current = await context();
  if (current.error) return { error: current.error };

  const { data: appointment, error: appointmentError } = await current.supabase
    .from("appointments")
    .select("id,professional_id,status")
    .eq("id", appointmentId)
    .eq("clinic_id", current.clinicId)
    .maybeSingle();
  if (appointmentError || !appointment)
    return { error: "Consulta não encontrada na clínica ativa." };
  if (appointment.professional_id !== current.userId)
    return { error: "Somente o profissional da consulta pode editar a Prescrição." };
  if (appointment.status !== "in_progress")
    return {
      error:
        "Esta consulta já foi finalizada e não pode ser alterada diretamente. Para registrar novas informações, crie um adendo ou um novo atendimento.",
    };

  const { data: record, error: recordError } = await current.supabase
    .from("medical_records")
    .select("id,status")
    .eq("appointment_id", appointmentId)
    .eq("clinic_id", current.clinicId)
    .is("deleted_at", null)
    .maybeSingle();
  if (recordError)
    return { error: "Não foi possível verificar o prontuário da consulta." };
  if (record && record.status !== "draft")
    return {
      error:
        "Esta consulta já foi finalizada e não pode ser alterada diretamente. Para registrar novas informações, crie um adendo ou um novo atendimento.",
    };

  const result = record
    ? await current.supabase
        .from("medical_records")
        .update({ prescription_draft: parsed.data })
        .eq("id", record.id)
        .eq("status", "draft")
        .select("id")
        .single()
    : await current.supabase
        .from("medical_records")
        .insert({
          appointment_id: appointmentId,
          prescription_draft: parsed.data,
        })
        .select("id")
        .single();
  if (result.error || !result.data) {
    console.error("ASTER_PRESCRIPTION_DRAFT_SAVE_ERROR", {
      code: result.error?.code ?? null,
      message: result.error?.message ?? null,
      details: result.error?.details ?? null,
      appointmentId,
    });
    return { error: "Não foi possível salvar o rascunho da Prescrição." };
  }
  revalidatePath(`/consultas/${appointmentId}/prontuario`);
  return { success: "Rascunho da Prescrição salvo.", id: result.data.id };
}

export async function issuePrescriptionFromMedicalRecord(
  appointmentId: string,
  values: MedicalRecordFormValues,
  prescription: PrescriptionDocument,
  idempotencyKey: string,
): Promise<SaveResult> {
  if (!idSchema.safeParse(appointmentId).success)
    return { error: "Consulta inválida." };
  const parsedRecord = medicalRecordSchema.safeParse(values);
  if (!parsedRecord.success)
    return {
      error:
        parsedRecord.error.issues[0]?.message ?? "Dados clínicos inválidos.",
    };
  if (!idSchema.safeParse(idempotencyKey).success)
    return { error: "Não foi possível identificar este rascunho." };
  if (!prescription.medications.length)
    return { error: "Adicione ao menos um medicamento antes de emitir." };

  const current = await context();
  if (current.error) return { error: current.error };
  const draftResult = await savePrescriptionDraft(appointmentId, {
    id: prescription.id,
    type: prescription.type,
    medications: prescription.medications,
    orientations: prescription.orientations,
    observations: prescription.observations,
  });
  if (draftResult.error) return { error: draftResult.error };
  const officialPrescriptionSnapshot = {
    ...prescription,
    _official_presentation: buildPrescriptionPresentation(prescription),
  };
  const { data, error } = await current.supabase.rpc(
    "issue_prescription_document_atomic",
    {
      target_appointment_id: appointmentId,
      medical_record_payload: recordPayload(parsedRecord.data),
      prescription_snapshot: officialPrescriptionSnapshot,
      idempotency_key: idempotencyKey,
    },
  );
  if (error || !data) {
    console.error("ASTER_PRESCRIPTION_ISSUE_ERROR", {
      code: error?.code ?? null,
      message: error?.message ?? null,
      details: error?.details ?? null,
      hint: error?.hint ?? null,
      appointmentId,
      idempotencyKey,
    });
    return { error: "Não foi possível emitir a receita. Revise os dados e tente novamente." };
  }

  const documentId = String(data);
  const officialResult = await current.supabase
    .from("clinical_documents")
    .select("clinic_id,public_number,content_hash,snapshot_json,pdf_status")
    .eq("id", documentId)
    .eq("clinic_id", current.clinicId)
    .single();
  if (
    !officialResult.error &&
    officialResult.data?.snapshot_json &&
    officialResult.data.pdf_status !== "available"
  ) {
    const snapshot =
      officialResult.data.snapshot_json as OfficialClinicalDocumentSnapshot;
    const pdf = generateOfficialClinicalDocumentPdf(snapshot);
    const hashPrefix = (officialResult.data.content_hash || "unhashed").slice(0, 16);
    const storagePath = `clinics/${officialResult.data.clinic_id}/documents/${documentId}/document-v${snapshot.document_version}-${hashPrefix}.pdf`;
    const uploaded = await current.supabase.storage
      .from("clinical-documents")
      .upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
    const pdfResult = await current.supabase.rpc(
      "set_clinical_document_pdf_result",
      {
        target_document_id: documentId,
        storage_path: uploaded.error ? null : storagePath,
        generation_status: uploaded.error ? "failed" : "available",
      },
    );
    if (uploaded.error || pdfResult.error) {
      console.error("ASTER_PRESCRIPTION_PDF_ERROR", {
        documentId,
        uploadCode: uploaded.error?.name ?? null,
        uploadMessage: uploaded.error?.message ?? null,
        databaseCode: pdfResult.error?.code ?? null,
        databaseMessage: pdfResult.error?.message ?? null,
      });
    }
  } else if (officialResult.error) {
    console.error("ASTER_PRESCRIPTION_PDF_ERROR", {
      documentId,
      databaseCode: officialResult.error.code,
      databaseMessage: officialResult.error.message,
    });
  }

  revalidatePath(`/consultas/${appointmentId}/prontuario`);
  revalidatePath(`/consultas/${appointmentId}/documentos`);
  revalidatePath(`/documentos/${documentId}`);
  revalidatePath(`/documentos/${documentId}/imprimir`);
  return {
    success: "Receita emitida e armazenada com sucesso.",
    id: documentId,
  };
}

export async function finalizeClinicalEncounter(
  appointmentId: string,
  lockToken: string,
  expectedAutosaveVersion: number,
  acknowledgeAlerts = false,
): Promise<SaveResult> {
  if (!idSchema.safeParse(appointmentId).success)
    return { error: "Consulta inválida." };
  const current = await context();
  if (current.error) return { error: current.error };
  await onConsultationFinalizationRequested({ appointmentId, patientId: "", actorId: current.userId, occurredAt: new Date().toISOString() });
  const { data, error } = await current.supabase.rpc("finalize_clinical_encounter_safe", { target_appointment_id: appointmentId, lock_token: lockToken, expected_autosave_version: expectedAutosaveVersion, acknowledge_alerts: acknowledgeAlerts });
  if (error) {
    await current.supabase.rpc("record_consultation_finalization_failure", { target_appointment_id: appointmentId, failure_code: error.code || "finalization_failed" });
    const known =
      error.message.includes("Preencha motivo") ||
      error.message.includes("Salve o prontuário") ||
      error.message.includes("Somente o profissional") ||
      error.message.includes("precisa estar em atendimento") ||
      error.message.includes("outra aba") ||
      error.message.includes("alterações mais recentes") ||
      error.message.includes("rascunho");
    if (!known)
      console.error("medical record finalize failed", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    await onConsultationFinalizationFailed({ appointmentId, patientId: "", actorId: current.userId, occurredAt: new Date().toISOString() });
    return {
      error: known
        ? error.message
        : "Não foi possível finalizar o atendimento.",
    };
  }
  revalidatePath(`/consultas/${appointmentId}/prontuario`);
  revalidatePath(`/appointments/${appointmentId}`);
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/recepcao");
  await onConsultationFinalized({ appointmentId, patientId: "", actorId: current.userId, occurredAt: new Date().toISOString() });
  return {
    success:
      "Consulta finalizada. O prontuário agora está somente para leitura.",
    id: data as string,
  };
}

export type FinalizationIssue = { severity: "blocking" | "warning" | "info"; code: string; message: string };
export async function validateConsultationFinalization(appointmentId: string) {
  if (!idSchema.safeParse(appointmentId).success) return { issues: [{ severity: "blocking", code: "invalid", message: "Consulta inválida." }] as FinalizationIssue[], summary: null };
  const current = await context(); if (current.error) return { issues: [{ severity: "blocking", code: "permission", message: current.error }] as FinalizationIssue[], summary: null };
  const [{ data: appointment }, { data: record }, { data: documents }] = await Promise.all([
    current.supabase.from("appointments").select("id,patient_id,professional_id,appointment_date,start_time,status,consultation_started_at").eq("id", appointmentId).eq("clinic_id", current.clinicId).maybeSingle(),
    current.supabase.from("medical_records").select("id,status,chief_complaint,hpi,physical_exam,assessment,cid10,plan,prescription,prescription_draft,exam_requests,return_guidance,last_saved_at,autosave_version").eq("appointment_id", appointmentId).eq("clinic_id", current.clinicId).is("deleted_at", null).maybeSingle(),
    current.supabase.from("clinical_documents").select("id,title,document_type,status").eq("appointment_id", appointmentId).eq("clinic_id", current.clinicId).is("deleted_at", null),
  ]);
  const issues: FinalizationIssue[] = [];
  if (!appointment?.patient_id) issues.push({ severity: "blocking", code: "patient", message: "Paciente ausente ou inválido." });
  if (!appointment?.professional_id || appointment.professional_id !== current.userId) issues.push({ severity: "blocking", code: "professional", message: "Somente o profissional responsável pode finalizar." });
  if (!appointment?.appointment_date || !appointment?.start_time) issues.push({ severity: "blocking", code: "schedule", message: "Data ou horário da consulta não identificado." });
  if (!record) issues.push({ severity: "blocking", code: "record", message: "O prontuário ainda não foi salvo." });
  if (record && !record.chief_complaint?.trim()) issues.push({ severity: "blocking", code: "chief_complaint", message: "Informe o motivo da consulta." });
  if (record && !record.assessment?.trim()) issues.push({ severity: "blocking", code: "assessment", message: "Revise a avaliação ou impressão diagnóstica." });
  if (record && !record.plan?.trim()) issues.push({ severity: "blocking", code: "plan", message: "Revise o plano ou conduta." });
  if (record && !record.hpi?.trim()) issues.push({ severity: "warning", code: "hpi", message: "A anamnese detalhada não foi preenchida." });
  if (record && !record.physical_exam?.trim()) issues.push({ severity: "warning", code: "physical_exam", message: "Nenhum exame físico foi registrado; confirme se não se aplica." });
  const draftDocuments = (documents ?? []).filter((item) => item.status === "draft" || item.status === "in_review");
  if (draftDocuments.length) issues.push({ severity: "warning", code: "draft_documents", message: `Existem ${draftDocuments.length} documento(s) em rascunho.` });
  const prescriptionDraft = record?.prescription_draft as { medications?: unknown[] } | null;
  if (prescriptionDraft?.medications?.length) issues.push({ severity: "warning", code: "prescription_draft", message: "Existe uma prescrição estruturada em rascunho." });
  if (record && !record.return_guidance?.trim()) issues.push({ severity: "info", code: "return", message: "Nenhum retorno foi definido." });
  if (!(documents ?? []).length) issues.push({ severity: "info", code: "documents", message: "Nenhum documento foi produzido." });
  if (record && !record.cid10?.trim()) issues.push({ severity: "info", code: "diagnosis", message: "Nenhum CID foi registrado." });
  return { issues, summary: appointment && record ? { appointment, record, documents: documents ?? [], draftDocuments, autosaveVersion: record.autosave_version } : null };
}

export async function createClinicalAddendum(recordId: string, content: string, reason: string) {
  if (!idSchema.safeParse(recordId).success || !content.trim() || !reason.trim()) return { error: "Informe conteúdo e justificativa do adendo." };
  const current = await context(); if (current.error) return { error: current.error };
  const { data, error } = await current.supabase.rpc("create_medical_record_addendum", { target_record_id: recordId, addendum_content: content.trim(), addendum_reason: reason.trim() });
  if (error) return { error: error.message || "Não foi possível registrar o adendo." };
  const { data: record } = await current.supabase.from("medical_records").select("appointment_id,patient_id").eq("id", recordId).maybeSingle();
  if (record) { revalidatePath(`/consultas/${record.appointment_id}/prontuario`); await onConsultationAddendumCreated({ appointmentId: record.appointment_id, patientId: record.patient_id, actorId: current.userId, occurredAt: new Date().toISOString() }); }
  return { success: "Adendo registrado sem alterar o conteúdo original.", id: data as string };
}
