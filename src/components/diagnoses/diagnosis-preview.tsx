import { Stethoscope } from "lucide-react";

import { diagnosisStatusLabels } from "@/lib/diagnosis-engine/serialization";
import type { ClinicalDiagnosis } from "@/lib/diagnosis-engine/types";

function PreviewItem({ diagnosis }: { diagnosis: ClinicalDiagnosis }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 text-xs">
      <p className="font-semibold">
        {diagnosis.code} — {diagnosis.description}
      </p>
      <p className="mt-1 text-muted-foreground">
        {diagnosis.classificationSystem} ·{" "}
        {diagnosisStatusLabels[diagnosis.status]}
      </p>
      {diagnosis.observation?.text && (
        <p className="mt-2 whitespace-pre-wrap">{diagnosis.observation.text}</p>
      )}
    </div>
  );
}

export function DiagnosisPreview({
  primary,
  secondary,
}: {
  primary: ClinicalDiagnosis | null;
  secondary: ClinicalDiagnosis[];
}) {
  return (
    <aside className="h-fit rounded-lg border border-primary/25 bg-background p-4 shadow-sm lg:sticky lg:top-3">
      <div className="flex items-center gap-2 border-b border-primary/20 pb-3">
        <Stethoscope className="size-4 text-primary" />
        <div>
          <h4 className="text-sm font-semibold">
            Pré-visualização dos Diagnósticos
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Atualização em tempo real
          </p>
        </div>
      </div>
      {!primary && !secondary.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Adicione um diagnóstico para visualizar o registro consolidado.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {primary && (
            <section>
              <h5 className="mb-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
                Diagnóstico principal
              </h5>
              <PreviewItem diagnosis={primary} />
            </section>
          )}
          {secondary.length > 0 && (
            <section className="space-y-2">
              <h5 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Diagnósticos secundários
              </h5>
              {secondary.map((item) => (
                <PreviewItem key={item.id} diagnosis={item} />
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
