import { redirect } from "next/navigation";

import { ContinuityList } from "@/components/continuity/continuity-list";
import { createClient } from "@/lib/supabase/server";

export default async function ContinuityPage() {
  const supabase = await createClient(); if (!supabase) redirect("/login");
  const { data: auth } = await supabase.auth.getUser(); if (!auth.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id",auth.user.id).maybeSingle(); if (!profile?.active_clinic_id) redirect("/onboarding");
  const { data, error } = await supabase.from("care_continuity_items").select("id,title,description,item_type,priority,status,due_at,patient_id,appointment_id,patient:patients(full_name,cpf)").eq("clinic_id",profile.active_clinic_id).order("due_at",{ascending:true,nullsFirst:false}).limit(100);
  return <main className="min-w-0 space-y-6 overflow-x-hidden pb-[max(2rem,env(safe-area-inset-bottom))]"><header><p className="text-sm text-muted-foreground">Retornos, encaminhamentos, exames e pendências clínicas</p><h1 className="text-3xl font-semibold tracking-tight">Continuidade do cuidado</h1></header>{error?<p role="alert" className="text-sm text-destructive">Não foi possível carregar as pendências.</p>:<ContinuityList items={(data??[]) as never} />}</main>;
}
