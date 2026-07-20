import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";

import type { PrescriptionDocument } from "@/lib/prescription-engine/types";
import { buildPrescriptionPresentation } from "@/lib/prescription-engine/presentation";

export function PrescriptionPreview({
  document,
  preview,
}: {
  document: PrescriptionDocument;
  preview: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const presentation = buildPrescriptionPresentation(document);

  return (
    <aside className="min-w-0 h-fit overflow-hidden rounded-lg border bg-muted/20 lg:sticky lg:top-3">
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2 border-b px-3 text-left"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        {document.clinic.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={document.clinic.logoUrl}
            alt=""
            className="size-6 rounded object-contain"
          />
        ) : (
          <div className="grid size-6 place-items-center rounded bg-primary/10">
            <FileText className="size-4 text-primary" />
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold">Pré-visualização da Receita</h4>
          <p className="text-[10px] text-muted-foreground">Atualização em tempo real</p>
        </div>
        <ChevronDown className={`ml-auto size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      {!collapsed && (
        <div className="p-3">
          <div className="mx-auto aspect-[1/1.414] max-h-[38rem] overflow-auto border bg-white p-[7%] text-neutral-950 shadow-sm dark:bg-neutral-50">
            <div aria-live="polite" className="font-serif text-[11px] leading-5">
              <strong className="block text-center">{document.clinic.name}</strong>
              <p className="mt-3">Paciente: {document.patient.name}</p>
              <p>Data: {new Date(document.issuedAt).toLocaleDateString("pt-BR")}</p>
              <p className="mt-4 font-bold">Rp/</p>
              <div className="mt-3 space-y-4">
                {presentation.medications.map((item, index) => (
                  <section key={document.medications[index]?.id ?? index}>
                    <strong>{index + 1}. {item.name}</strong>
                    {item.formAndPackage && <p>{item.formAndPackage}</p>}
                    {item.posology && <p className="mt-1">{item.posology}</p>}
                    {item.quantity && <p>{item.quantity}</p>}
                    {item.orientations.length > 0 && (
                      <div className="mt-1">
                        <span className="font-semibold">Orientações:</span>
                        {item.orientations.map((line) => <p key={line}>- {line}</p>)}
                      </div>
                    )}
                  </section>
                ))}
              </div>
              <span className="sr-only">{preview}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
