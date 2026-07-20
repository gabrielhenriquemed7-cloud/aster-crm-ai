import { FileClock, LockKeyhole, ShieldCheck } from "lucide-react";

import type {
  MedicalRecordAccessPolicy,
  MedicalRecordAudit,
  MedicalRecordSignature,
} from "@/lib/medical-record-center/types";

export function MedicalRecordGovernance({
  access,
  audit,
  signature,
}: {
  access: MedicalRecordAccessPolicy;
  audit: MedicalRecordAudit;
  signature: MedicalRecordSignature;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-3 print:hidden">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileClock className="size-4 text-primary" /> Auditoria
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Criado:{" "}
          {audit.createdAt
            ? new Date(audit.createdAt).toLocaleString("pt-BR")
            : "Não informado"}
        </p>
        <p className="text-xs text-muted-foreground">
          Última edição:{" "}
          {audit.updatedAt
            ? new Date(audit.updatedAt).toLocaleString("pt-BR")
            : "Não informada"}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="size-4 text-primary" /> Assinatura Digital
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Status: {signature.status === "signed" ? "Assinado" : "Pendente"}
        </p>
        <p className="text-xs text-muted-foreground">
          Hash, certificado, QR Code e carimbo do tempo preparados no contrato.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" /> Acesso e LGPD
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Visualização {access.canView ? "permitida" : "bloqueada"} · impressão{" "}
          {access.canPrint ? "permitida" : "bloqueada"} · exportação{" "}
          {access.canExport ? "permitida" : "bloqueada"}.
        </p>
        <p className="text-xs text-muted-foreground">
          Registro persistente de visualizações e downloads ainda não ativado.
        </p>
      </div>
    </section>
  );
}
