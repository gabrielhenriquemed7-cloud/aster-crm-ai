"use client";

import { ClipboardCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PhysicalExamPreview({
  disabled,
  text,
  onGenerate,
}: {
  disabled: boolean;
  text: string;
  onGenerate: () => void;
}) {
  return (
    <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
      <div className="overflow-hidden rounded-lg border border-warning/30 bg-warning/5 shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Sparkles className="size-4 text-warning" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Pré-visualização</h3>
        </div>
        <div
          className="max-h-[28rem] min-h-44 overflow-y-auto p-3"
          aria-live="polite"
        >
          {text ? (
            <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              Selecione Normal ou Alterado nos sistemas avaliados. Nenhum achado
              será presumido.
            </p>
          )}
        </div>
        <div className="border-t p-3">
          <Button
            type="button"
            className="w-full"
            disabled={disabled || !text.trim()}
            onClick={onGenerate}
          >
            <ClipboardCheck aria-hidden="true" />
            Gerar Exame Completo
          </Button>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Revise o texto antes de adicioná-lo ao prontuário.
          </p>
        </div>
      </div>
    </aside>
  );
}
