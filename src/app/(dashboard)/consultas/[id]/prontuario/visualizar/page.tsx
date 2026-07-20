import { AlertCircle } from "lucide-react";
import { notFound } from "next/navigation";

import { MedicalRecordCenter } from "@/components/medical-records/medical-record-center";
import { getMedicalRecordCenterData } from "@/lib/medical-record-center/service";

export default async function MedicalRecordCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getMedicalRecordCenterData(id);
  if (!result.data && !result.error) notFound();
  if (result.error || !result.data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertCircle className="mx-auto size-8 text-destructive" />
        <h1 className="mt-3 font-semibold">
          Não foi possível carregar o prontuário
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>
      </div>
    );
  }
  return (
    <MedicalRecordCenter data={result.data} canEdit={result.canEdit ?? false} />
  );
}
