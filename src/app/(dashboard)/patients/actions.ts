"use server";

import { revalidatePath } from "next/cache";

import { patientSchema, type PatientFormValues } from "@/lib/patients/schema";
import type { Patient, PatientInput } from "@/lib/patients/types";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
  id?: string;
  success?: string | false;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

type SupabaseError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function databaseError(action: string, error: SupabaseError) {
  console.error(`patient ${action} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  if (process.env.NODE_ENV !== "production") {
    const detail = [error.code, error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" · ");
    return `${action}: ${detail || "Erro desconhecido do Supabase."}`;
  }

  return `Não foi possível ${action.toLocaleLowerCase()}.`;
}

function nullable(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toPatientInput(values: PatientFormValues): PatientInput {
  return {
    full_name: values.full_name.trim(),
    social_name: nullable(values.social_name),
    cpf: nullable(values.cpf)?.replace(/\D/g, "") ?? null,
    rg: nullable(values.rg),
    cns: nullable(values.cns) ?? null,
    birth_date: nullable(values.birth_date) ?? null,
    gender: nullable(values.gender) ?? null,
    race_ethnicity: nullable(values.race_ethnicity),
    marital_status: nullable(values.marital_status) ?? null,
    nationality: nullable(values.nationality),
    birthplace: nullable(values.birthplace),
    mother_name: nullable(values.mother_name),
    father_name: nullable(values.father_name),
    occupation: nullable(values.occupation) ?? null,
    zip_code: nullable(values.zip_code)?.replace(/\D/g, "") ?? null,
    address: nullable(values.address) ?? null,
    address_number: nullable(values.address_number),
    address_complement: nullable(values.address_complement),
    neighborhood: nullable(values.neighborhood),
    city: nullable(values.city) ?? null,
    state: nullable(values.state)?.toUpperCase() ?? null,
    phone: nullable(values.phone) ?? null,
    whatsapp: nullable(values.whatsapp) ?? null,
    email: nullable(values.email)?.toLowerCase() ?? null,
    insurance: nullable(values.insurance) ?? null,
    insurance_card: nullable(values.insurance_card) ?? null,
    emergency_contact_name: nullable(values.emergency_contact_name),
    emergency_contact_phone: nullable(values.emergency_contact_phone),
    emergency_contact_relationship: nullable(
      values.emergency_contact_relationship,
    ),
    blood_type: nullable(values.blood_type),
    allergies: nullable(values.allergies) ?? null,
    comorbidities: nullable(values.comorbidities) ?? null,
    continuous_medications: nullable(values.continuous_medications),
    medical_history: nullable(values.medical_history),
    notes: nullable(values.notes) ?? null,
  };
}

async function uploadPhoto(patientId: string, file: File) {
  const supabase = await createClient();
  if (!supabase || !file.size) return { url: null };

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "Sua sessão expirou. Entre novamente." };
  if (!file.type.startsWith("image/"))
    return { error: "Envie uma imagem válida." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "A foto deve ter no máximo 5 MB." };

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${authData.user.id}/${patientId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("patient-photos")
    .upload(path, file, { upsert: true });
  if (error) return { error: "Não foi possível enviar a foto." };

  return {
    url: supabase.storage.from("patient-photos").getPublicUrl(path).data
      .publicUrl,
  };
}

export async function createPatient(
  values: PatientFormValues,
  photo?: File,
): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(values);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  if (!supabase)
    return { error: "Configure o Supabase para cadastrar pacientes." };
  const { data: authData } = await supabase.auth.getUser();
  console.info("ASTER_PATIENT_AUTH_CONTEXT", {
    authenticated_user: Boolean(authData.user),
  });
  if (!authData.user) return { error: "Faça login para cadastrar pacientes." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id)
    return {
      error: "Selecione ou crie uma clínica antes de cadastrar pacientes.",
    };
  const { data: membership, error: membershipError } = await supabase
    .from("clinic_members")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("clinic_id", profile.active_clinic_id)
    .eq("status", "active")
    .maybeSingle();
  console.info("ASTER_PATIENT_MEMBERSHIP_CONTEXT", {
    active_membership: Boolean(membership),
    clinic_id: profile.active_clinic_id,
  });
  if (membershipError)
    return {
      error: databaseError("Validar acesso à clínica", membershipError),
    };
  if (!membership)
    return {
      error: "Seu usuário não possui vínculo ativo com a clínica selecionada.",
    };

  const patientInput = {
    ...toPatientInput(parsed.data),
    user_id: authData.user.id,
    clinic_id: profile.active_clinic_id,
  };
  console.info("ASTER_PATIENT_INSERT_CONTEXT", {
    user_id: authData.user.id,
    clinic_id: profile.active_clinic_id,
    table: "public.patients",
    properties: Object.keys(patientInput),
    includes_clinic_id: Object.hasOwn(patientInput, "clinic_id"),
    includes_created_by: Object.hasOwn(patientInput, "created_by"),
  });

  const { data, error } = await supabase
    .from("patients")
    .insert(patientInput)
    .select("id")
    .single();
  if (error) {
    console.error("ASTER_PATIENT_INSERT_ERROR", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return {
      success: false,
      error: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    };
  }
  if (!data)
    return {
      error:
        "Não foi possível cadastrar o paciente: o Supabase não retornou o registro criado.",
    };

  if (photo?.size) {
    const result = await uploadPhoto(data.id, photo);
    if (result.error) return { error: result.error };
    if (result.url)
      await supabase
        .from("patients")
        .update({ photo_url: result.url })
        .eq("id", data.id);
  }

  revalidatePath("/patients");
  return { success: "Paciente cadastrado com sucesso.", id: data.id };
}

export async function updatePatient(
  id: string,
  values: PatientFormValues,
  photo?: File,
): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(values);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  if (!supabase)
    return { error: "Configure o Supabase para editar pacientes." };

  const { error } = await supabase
    .from("patients")
    .update(toPatientInput(parsed.data))
    .eq("id", id);
  if (error)
    return { error: databaseError("Salvar alterações do paciente", error) };
  if (photo?.size) {
    const result = await uploadPhoto(id, photo);
    if (result.error) return { error: result.error };
    if (result.url)
      await supabase
        .from("patients")
        .update({ photo_url: result.url })
        .eq("id", id);
  }

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { success: "Paciente atualizado com sucesso.", id };
}

export async function deletePatient(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase)
    return { error: "Configure o Supabase para excluir pacientes." };
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "Faça login para excluir pacientes." };
  const { error } = await supabase
    .from("patients")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: authData.user.id,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { error: databaseError("Excluir paciente", error) };
  revalidatePath("/patients");
  return { success: "Paciente excluído com sucesso." };
}

export async function getPatient(id: string): Promise<Patient | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data as Patient | null;
}

export async function listPatientRecordAppointments(patientId: string) {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, title, appointment_date, start_time, appointment_type, status, professional:profiles(full_name)",
    )
    .eq("patient_id", patientId)
    .in("status", ["in_progress", "completed"])
    .order("appointment_date", { ascending: false })
    .order("start_time", { ascending: false });
  return data ?? [];
}

export async function listPatients({
  page = 1,
  search = "",
  gender = "",
  insurance = "",
}: {
  page?: number;
  search?: string;
  gender?: string;
  insurance?: string;
}) {
  const supabase = await createClient();
  const pageSize = 10;
  if (!supabase) return { patients: [] as Patient[], total: 0, pageSize };

  let query = supabase
    .from("patients")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order("full_name")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (search.trim()) {
    const term = search.trim().replace(/[%_,()]/g, "");
    const cpf = term.replace(/\D/g, "");
    query = query.or(
      `full_name.ilike.%${term}%,social_name.ilike.%${term}%,cpf.ilike.%${cpf || term}%`,
    );
  }
  if (gender) query = query.eq("gender", gender);
  if (insurance) query = query.ilike("insurance", `%${insurance}%`);
  const { data, count } = await query;
  return { patients: (data ?? []) as Patient[], total: count ?? 0, pageSize };
}
