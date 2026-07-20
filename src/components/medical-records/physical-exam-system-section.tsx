"use client";

import { Check, ChevronRight, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  PhysicalExamStatus,
  PhysicalExamSystemDefinition,
  PhysicalExamSystemValue,
} from "@/lib/physical-exam/types";

export function PhysicalExamSystemSection({
  definition,
  disabled,
  value,
  onDescriptionChange,
  onStatusChange,
}: {
  definition: PhysicalExamSystemDefinition;
  disabled: boolean;
  value: PhysicalExamSystemValue;
  onDescriptionChange: (value: string) => void;
  onStatusChange: (status: PhysicalExamStatus) => void;
}) {
  return (
    <details className="group overflow-hidden rounded-lg border bg-card">
      <summary className="grid h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-2 px-3 [&::-webkit-details-marker]:hidden">
        <span className="truncate text-sm font-semibold">
          {definition.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {value.status === "normal"
            ? "Normal"
            : value.status === "altered"
              ? "Alterado"
              : "Não avaliado"}
        </span>
        <ChevronRight
          className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-3 border-t p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-pressed={value.status === "normal"}
            className={
              value.status === "normal"
                ? "border-warning bg-warning/15 hover:bg-warning/25"
                : ""
            }
            onClick={() => onStatusChange("normal")}
          >
            <Check aria-hidden="true" />
            Normal
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-pressed={value.status === "altered"}
            className={
              value.status === "altered"
                ? "border-warning bg-warning/15 hover:bg-warning/25"
                : ""
            }
            onClick={() => onStatusChange("altered")}
          >
            <PencilLine aria-hidden="true" />
            Alterado
          </Button>
        </div>
        {value.status === "normal" && (
          <p className="rounded-md bg-muted/40 p-2 text-xs leading-5 text-muted-foreground">
            {definition.normalText}
          </p>
        )}
        {value.status === "altered" && (
          <label className="block text-xs font-medium">
            Descreva os achados
            <textarea
              rows={3}
              disabled={disabled}
              value={value.description}
              placeholder={`Registre as alterações de ${definition.label.toLocaleLowerCase("pt-BR")}.`}
              className="mt-1 w-full resize-y overflow-hidden rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onInput={(event) => {
                event.currentTarget.style.height = "auto";
                event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
              }}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
          </label>
        )}
      </div>
    </details>
  );
}
