"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MedicalRecordError({ reset }: { reset: () => void }) {
  return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"><AlertCircle className="mx-auto size-8 text-destructive" /><h1 className="mt-3 font-semibold">Não foi possível carregar o prontuário</h1><p className="mt-1 text-sm text-muted-foreground">Tente novamente. Se o problema persistir, verifique sua conexão.</p><Button className="mt-4" type="button" onClick={reset}>Tentar novamente</Button></div>;
}
