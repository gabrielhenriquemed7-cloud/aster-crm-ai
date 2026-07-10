"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const clinicSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome da clínica."),
  legalName: z.string().trim().max(180).optional(),
  cnpj: z.string().trim().regex(/^$|^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, "CNPJ inválido.").optional(),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
});

export async function createInitialClinic(input: unknown) {
  const parsed = clinicSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou. Entre novamente." };

  const { data, error } = await supabase.rpc("create_clinic_with_owner", {
    clinic_name: parsed.data.name,
    clinic_legal_name: parsed.data.legalName || null,
    clinic_cnpj: parsed.data.cnpj || null,
    clinic_email: parsed.data.email || null,
    clinic_phone: parsed.data.phone || null,
  });

  if (error) {
    console.error("clinic onboarding failed", { code: error.code, message: error.message });
    return { error: error.message || "Não foi possível criar a clínica." };
  }
  if (!data) return { error: "A clínica não retornou um identificador válido." };

  revalidatePath("/", "layout");
  return { success: "Clínica criada com sucesso.", clinicId: data };
}
