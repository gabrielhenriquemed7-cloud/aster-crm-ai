import { Sparkles } from "lucide-react";

import { ClinicalPreview } from "@/components/clinical-workspace/workspace-primitives";
import { useWorkspaceContext } from "@/components/clinical-workspace/workspace-provider";
import { workspaceSections } from "@/lib/clinical-workspace/section-registry";

export function ContextualClinicalPanel() {
  const { activeSection, clinicalState, scrollPosition } =
    useWorkspaceContext();
  const current =
    workspaceSections.find((item) => item.id === activeSection) ??
    workspaceSections[0];
  const previewBySection = {
    anamnesis: clinicalState.anamnesis,
    scores: clinicalState.scores,
    physical_exam: clinicalState.physicalExam,
    assessment: clinicalState.diagnoses,
    plan: clinicalState.conduct,
    prescription: clinicalState.prescription,
    record: [
      clinicalState.anamnesis,
      clinicalState.physicalExam,
      clinicalState.diagnoses,
      clinicalState.conduct,
      clinicalState.prescription,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
  return (
    <section className="rounded-lg border border-primary/25 bg-primary/[0.035] p-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <strong className="text-xs">{current.label}</strong>
        <span className="ml-auto text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {Math.round(scrollPosition)}px
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {current.contextualTools.map((item) => (
          <span
            key={item}
            className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
      <div className="mt-2">
        <ClinicalPreview
          title="Documento vivo"
          content={previewBySection[activeSection]}
        />
      </div>
    </section>
  );
}
