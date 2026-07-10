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
  const { data: membership, error: membershipError } = profile?.active_clinic_id
    ? await supabase
        .from("clinic_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("clinic_id", profile.active_clinic_id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null, error: null };

  if (!profileError && !membershipError && (!profile?.active_clinic_id || !membership)) {
    redirect("/onboarding");
  }

  return <AppShell>{children}</AppShell>;
}
