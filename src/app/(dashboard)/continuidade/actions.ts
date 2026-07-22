"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["complete", "cancel", "reopen"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function updateContinuityItem(input: unknown) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Ação inválida." };
  if (parsed.data.action === "cancel" && !parsed.data.reason)
    return { error: "Informe o motivo do cancelamento." };
  if (parsed.data.action === "reopen" && !parsed.data.reason)
    return { error: "Informe a justificativa para reabrir." };
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou." };
  const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active_clinic_id) return { error: "Selecione uma clínica ativa." };
  const { data: item } = await supabase.from("care_continuity_items").select("id,status,professional_id").eq("id", parsed.data.id).eq("clinic_id", profile.active_clinic_id).maybeSingle();
  if (!item) return { error: "Pendência não encontrada." };
  if (item.professional_id !== auth.user.id)
    return { error: "Somente o profissional responsável pode concluir, cancelar ou reabrir esta pendência clínica." };
  const now = new Date().toISOString();
  const status = parsed.data.action === "complete" ? "completed" : parsed.data.action === "cancel" ? "cancelled" : "pending";
  const patch = parsed.data.action === "complete"
    ? { status, completed_at: now, completed_by: auth.user.id }
    : parsed.data.action === "cancel"
      ? { status, cancelled_at: now, cancelled_by: auth.user.id, cancellation_reason: parsed.data.reason }
      : { status, completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancellation_reason: null };
  const result = await supabase.from("care_continuity_items").update(patch).eq("id", item.id).eq("clinic_id", profile.active_clinic_id);
  if (result.error) return { error: "Não foi possível atualizar a pendência." };
  revalidatePath("/continuidade");
  revalidatePath("/dashboard");
  return { success: status === "completed" ? "Pendência concluída." : status === "cancelled" ? "Pendência cancelada." : "Pendência reaberta." };
}
