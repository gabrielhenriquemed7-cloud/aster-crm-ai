import { Loader2 } from "lucide-react";

export default function MedicalRecordLoading() {
  return <div className="grid min-h-80 place-items-center rounded-xl border"><div className="text-center"><Loader2 className="mx-auto size-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Carregando prontuário e histórico...</p></div></div>;
}
