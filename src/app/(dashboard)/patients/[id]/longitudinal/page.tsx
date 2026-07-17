import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LongitudinalDashboard } from "@/components/patients/longitudinal-dashboard";
import { getLongitudinalDashboardData } from "@/lib/longitudinal/service";

export default async function PatientLongitudinalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getLongitudinalDashboardData(id);
  if (!data) notFound();
  return <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-label="Carregando dashboard clínico" />}><LongitudinalDashboard data={data} /></Suspense>;
}
