"use server";

import { revalidatePath } from "next/cache";

import { patientSchema, type PatientFormValues } from "@/lib/patients/schema";
import type { Patient, PatientInput } from "@/lib/patients/types";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string; id?: string; success?: string };

function nullable(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toPatientInput(values: PatientFormValues): PatientInput {
  return {
    full_name: values.full_name.trim(),
    cpf: nullable(values.cpf)?.replace(/\D/g, "") ?? null,
    cns: nullable(values.cns) ?? null,
    birth_date: nullable(values.birth_date) ?? null,
    gender: nullable(values.gender) ?? null,
    marital_status: nullable(values.marital_status) ?? null,
    occupation: nullable(values.occupation) ?? null,
    zip_code: nullable(values.zip_code) ?? null,
    address: nullable(values.address) ?? null,
    city: nullable(values.city) ?? null,
    state: nullable(values.state)?.toUpperCase() ?? null,
    phone: nullable(values.phone) ?? null,
    whatsapp: nullable(values.whatsapp) ?? null,
    email: nullable(values.email)?.toLowerCase() ?? null,
    insurance: nullable(values.insurance) ?? null,
    insurance_card: nullable(values.insurance_card) ?? null,
    emergency_contact: nullable(values.emergency_contact) ?? null,
    allergies: nullable(values.allergies) ?? null,
    comorbidities: nullable(values.comorbidities) ?? null,
    notes: nullable(values.notes) ?? null,
  };
}

async function uploadPhoto(patientId: string, file: File) {
  const supabase = await createClient();
  if (!supabase || !file.size) return { url: null };

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "Sua sessão expirou. Entre novamente." };
  if (!file.type.startsWith("image/")) return { error: "Envie uma imagem válida." };
  if (file.size > 5 * 1024 * 1024) return { error: "A foto deve ter no máximo 5 MB." };

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${authData.user.id}/${patientId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from("patient-photos").upload(path, file, { upsert: true });
  if (error) return { error: "Não foi possível enviar a foto." };

  return { url: supabase.storage.from("patient-photos").getPublicUrl(path).data.publicUrl };
}

export async function createPatient(values: PatientFormValues, photo?: File): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase para cadastrar pacientes." };
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "Faça login para cadastrar pacientes." };

  const { data, error } = await supabase
    .from("patients")
    .insert({ ...toPatientInput(parsed.data), user_id: authData.user.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível cadastrar o paciente." };

  if (photo?.size) {
    const result = await uploadPhoto(data.id, photo);
    if (result.error) return { error: result.error };
    if (result.url) await supabase.from("patients").update({ photo_url: result.url }).eq("id", data.id);
  }

  revalidatePath("/patients");
  return { success: "Paciente cadastrado com sucesso.", id: data.id };
}

export async function updatePatient(id: string, values: PatientFormValues, photo?: File): Promise<ActionResult> {
  const parsed = patientSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase para editar pacientes." };

  const { error } = await supabase.from("patients").update(toPatientInput(parsed.data)).eq("id", id);
  if (error) return { error: "Não foi possível salvar as alterações." };
  if (photo?.size) {
    const result = await uploadPhoto(id, photo);
    if (result.error) return { error: result.error };
    if (result.url) await supabase.from("patients").update({ photo_url: result.url }).eq("id", id);
  }

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { success: "Paciente atualizado com sucesso.", id };
}

export async function deletePatient(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase para excluir pacientes." };
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir o paciente." };
  revalidatePath("/patients");
  return { success: "Paciente excluído com sucesso." };
}

export async function getPatient(id: string): Promise<Patient | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  return data as Patient | null;
}

export async function listPatients({ page = 1, search = "", gender = "", insurance = "" }: { page?: number; search?: string; gender?: string; insurance?: string }) {
  const supabase = await createClient();
  const pageSize = 10;
  if (!supabase) return { patients: [] as Patient[], total: 0, pageSize };

  let query = supabase.from("patients").select("*", { count: "exact" }).order("full_name").range((page - 1) * pageSize, page * pageSize - 1);
  if (search.trim()) {
    const term = search.trim().replace(/[,()]/g, "");
    query = query.or(`full_name.ilike.%${term}%,cpf.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (gender) query = query.eq("gender", gender);
  if (insurance) query = query.ilike("insurance", `%${insurance}%`);
  const { data, count } = await query;
  return { patients: (data ?? []) as Patient[], total: count ?? 0, pageSize };
}
