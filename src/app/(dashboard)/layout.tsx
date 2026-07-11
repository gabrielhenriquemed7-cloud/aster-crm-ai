import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", user.id)
    .maybeSingle();
  const { data: memberships, error: membershipError } = await supabase
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (membershipError) redirect("/onboarding?error=membership");
  if (!memberships?.length) {
    redirect("/onboarding");
  }

  const hasActiveClinic = memberships.some((membership) => membership.clinic_id === profile?.active_clinic_id);
  if (!profileError && !hasActiveClinic) {
    const { error: activationError } = await supabase.rpc("set_active_clinic", { target_clinic_id: memberships[0].clinic_id });
    if (activationError) redirect("/onboarding?error=clinic");
  }

  return <AppShell>{children}</AppShell>;
}
