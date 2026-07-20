"use client";

import { Check, Loader2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDiagnosisSearch } from "@/hooks/use-diagnosis-search";
import type {
  ClinicalDiagnosis,
  DiagnosticClassificationSystem,
  DiagnosticSearchResult,
} from "@/lib/diagnosis-engine/types";

const systems: DiagnosticClassificationSystem[] = [
  "CID-10",
  "CID-11",
  "CIAP-2",
];

export function DiagnosisSearch({
  query,
  onQueryChange,
  selectedSystems,
  onSystemsChange,
  diagnoses,
  disabled,
  onAdd,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  selectedSystems: DiagnosticClassificationSystem[];
  onSystemsChange: (systems: DiagnosticClassificationSystem[]) => void;
  diagnoses: ClinicalDiagnosis[];
  disabled: boolean;
  onAdd: (result: DiagnosticSearchResult) => void;
}) {
  const { results, loading, error } = useDiagnosisSearch(
    query,
    selectedSystems,
  );

  function toggle(system: DiagnosticClassificationSystem) {
    onSystemsChange(
      selectedSystems.includes(system)
        ? selectedSystems.filter((item) => item !== system)
        : [...selectedSystems, system],
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-background p-3">
      <div>
        <label htmlFor="diagnosis-search" className="text-xs font-medium">
          Buscar diagnóstico por descrição, sinônimo ou código
        </label>
        <div className="relative mt-1">
          {loading ? (
            <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
          ) : (
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            id="diagnosis-search"
            className="pl-9"
            disabled={disabled}
            value={query}
            placeholder="Ex.: hipertensão, diabetes, I10"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium">
          Sistemas classificatórios
        </legend>
        <div className="flex flex-wrap gap-2">
          {systems.map((system) => (
            <label
              key={system}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs has-checked:border-primary/50 has-checked:bg-primary/5"
            >
              <input
                type="checkbox"
                checked={selectedSystems.includes(system)}
                disabled={disabled}
                onChange={() => toggle(system)}
              />
              {system}
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite" className="space-y-2">
        {!query.trim() && (
          <p className="text-xs text-muted-foreground">
            Digite um termo para pesquisar na amostra local.
          </p>
        )}
        {query.trim() && !loading && error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {query.trim() && !loading && !error && !results.length && (
          <p className="text-xs text-muted-foreground">
            Nenhum resultado encontrado na fonte local selecionada.
          </p>
        )}
        {results.map((result) => {
          const added = diagnoses.some(
            (item) =>
              item.classificationSystem === result.classificationSystem &&
              item.code.toLocaleLowerCase() === result.code.toLocaleLowerCase(),
          );
          return (
            <article
              key={`${result.classificationSystem}-${result.code}`}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-xs">
                <p className="font-semibold">
                  {result.code} — {result.description}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {result.classificationSystem}
                  {result.category ? ` · ${result.category}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={added ? "outline" : "default"}
                disabled={disabled || added}
                onClick={() => onAdd(result)}
              >
                {added ? <Check /> : <Plus />}
                {added ? "Já adicionado" : "Adicionar"}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
