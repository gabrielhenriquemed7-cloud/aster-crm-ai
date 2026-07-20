import { ClipboardList, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ClinicalPlanPreview({
  preview,
  onCopy,
}: {
  preview: string;
  onCopy: () => void;
}) {
  return (
    <aside className="h-fit rounded-lg border border-primary/25 bg-background p-4 shadow-sm lg:sticky lg:top-3">
      <div className="flex items-start justify-between gap-2 border-b border-primary/20 pb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <div>
            <h4 className="text-sm font-semibold">
              Pré-visualização da Conduta
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Consolidação determinística em tempo real
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!preview}
          aria-label="Copiar pré-visualização da conduta"
          onClick={onCopy}
        >
          <Copy />
        </Button>
      </div>
      {preview ? (
        <pre
          aria-live="polite"
          className="mt-3 max-h-[40rem] overflow-auto whitespace-pre-wrap font-sans text-xs leading-5"
        >
          {preview}
        </pre>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Preencha algum bloco para visualizar a conduta consolidada.
        </p>
      )}
    </aside>
  );
}
