import { listReceptionPatients } from "@/app/(dashboard)/recepcao/actions";
import { ReceptionWorkspace } from "@/components/reception/reception-workspace";

export default async function ReceptionPage() {
  const result = await listReceptionPatients();
  return <ReceptionWorkspace initialPatients={result.patients} loadError={result.error} />;
}
