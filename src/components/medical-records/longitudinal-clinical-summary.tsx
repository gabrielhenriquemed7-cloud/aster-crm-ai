"use client";

import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  FileSearch,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { generateLongitudinalSummary } from "@/app/(dashboard)/consultas/longitudinal-summary-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  LongitudinalSource,
  StoredLongitudinalSummary,
} from "@/lib/ai/longitudinal-schema";

const errors: Record<string, string> = {
  LONGITUDINAL_NO_HISTORY:
    "Não existem registros clínicos suficientes para gerar o resumo.",
  LONGITUDINAL_PERMISSION_DENIED:
    "Você não possui permissão para acessar este histórico.",
  LONGITUDINAL_CONTEXT_TOO_LARGE:
    "O histórico é muito extenso e não pôde ser processado integralmente.",
  LONGITUDINAL_INVALID_RESPONSE:
    "O resumo retornado não pôde ser interpretado.",
  LONGITUDINAL_SAVE_ERROR: "O resumo foi gerado, mas não pôde ser salvo.",
  LONGITUDINAL_ERROR: "Não foi possível gerar o resumo clínico.",
};

function dateTime(value: string | null) {
  if (!value) return "Ainda não atualizado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function SourceLinks({
  ids,
  sources,
}: {
  ids: string[];
  sources: LongitudinalSource[];
}) {
  const matches = sources.filter((source) => ids.includes(source.id));
  if (!matches.length) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Fonte: {matches.map((source) => source.date).join(", ")}
    </p>
  );
}

export function LongitudinalClinicalSummary({
  patientId,
  initialSummary,
}: {
  patientId: string;
  initialSummary: StoredLongitudinalSummary | null;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    const result = await generateLongitudinalSummary({ patientId });
    setLoading(false);
    if (result.error || !result.summary) {
      const code = result.error || "LONGITUDINAL_ERROR";
      setError(`${code}: ${errors[code] || errors.LONGITUDINAL_ERROR}`);
      return;
    }
    const next = { ...result.summary, has_new_records: false };
    setSummary(next);
  }

  const data = summary?.summary;
  const sources = summary?.sources ?? [];

  return (
    <details className="group rounded-xl border border-primary/20 bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-5 text-primary" /> RESUMO CLÍNICO DO
            PACIENTE
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Última atualização: {dateTime(summary?.generated_at ?? null)} ·{" "}
            {summary?.records_count ?? 0} registro(s) analisado(s)
          </p>
        </div>
        <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t p-5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={loading}
            onClick={() => void generate()}
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : summary ? (
              <RefreshCw />
            ) : (
              <Sparkles />
            )}
            {summary ? "Atualizar resumo" : "Gerar resumo"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!sources.length}
            onClick={() => setSourcesOpen(true)}
          >
            <FileSearch /> Ver fontes do histórico
          </Button>
        </div>
        {summary?.has_new_records && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
            Há informações novas no prontuário. Atualize o resumo clínico.
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm text-muted-foreground">
            Gerando resumo clínico longitudinal...
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !loading && (
          <p className="text-sm text-muted-foreground">
            O resumo não é gerado automaticamente. Use “Gerar resumo” quando
            desejar consolidar o histórico.
          </p>
        )}
        {data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold">Visão geral</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {data.overview}
              </p>
            </section>
            {data.activeProblems.length > 0 && (
              <section className="rounded-lg border p-4">
                <h3 className="text-sm font-semibold">Problemas ativos</h3>
                <ul className="mt-2 space-y-3 text-sm">
                  {data.activeProblems.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{item.name}</strong>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p>
                        {item.approximateOnset} · {item.lastInformation}
                      </p>
                      <SourceLinks ids={item.sourceIds} sources={sources} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(data.allergies.length > 0 ||
              data.currentMedications.length > 0) && (
              <section className="rounded-lg border p-4">
                <h3 className="text-sm font-semibold">
                  Alergias e medicamentos atuais
                </h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {data.allergies.map((item, index) => (
                    <li key={`${item.substance}-${index}`}>
                      <strong>Alergia:</strong> {item.substance}
                      {item.reaction ? ` — ${item.reaction}` : ""}
                      <SourceLinks ids={item.sourceIds} sources={sources} />
                    </li>
                  ))}
                  {data.currentMedications.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                      <strong>Medicamento:</strong> {item.label}
                      {item.details ? ` — ${item.details}` : ""}
                      <SourceLinks ids={item.sourceIds} sources={sources} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.relevantHistory.length > 0 && (
              <section className="rounded-lg border p-4">
                <h3 className="text-sm font-semibold">
                  Antecedentes relevantes
                </h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {data.relevantHistory.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                      <strong>{item.label}</strong>
                      {item.details ? ` — ${item.details}` : ""}
                      <SourceLinks ids={item.sourceIds} sources={sources} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(data.confirmedDiagnoses.length > 0 ||
              data.registeredCids.length > 0 ||
              data.unconfirmedOldHypotheses.length > 0) && (
              <section className="rounded-lg border p-4">
                <h3 className="text-sm font-semibold">Diagnósticos e CID</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {data.confirmedDiagnoses.map((item, index) => (
                    <li key={`d-${index}`}>
                      <strong>Registrado:</strong> {item.label} — {item.details}
                    </li>
                  ))}
                  {data.registeredCids.map((item, index) => (
                    <li key={`c-${index}`}>
                      <strong>CID:</strong> {item.label} — {item.details}
                    </li>
                  ))}
                  {data.unconfirmedOldHypotheses.map((item, index) => (
                    <li key={`h-${index}`} className="text-amber-700">
                      <strong>Hipótese antiga não confirmada:</strong>{" "}
                      {item.label}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.relevantExams.length > 0 && (
              <section className="rounded-lg border p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold">Exames relevantes</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2">Exame</th>
                        <th className="p-2">Resultado</th>
                        <th className="p-2">Data</th>
                        <th className="p-2">Tendência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.relevantExams.map((item, index) => (
                        <tr key={`${item.exam}-${index}`} className="border-b">
                          <td className="p-2">{item.exam}</td>
                          <td className="p-2">{item.result}</td>
                          <td className="p-2">{item.date}</td>
                          <td className="p-2">{item.trend}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {data.timeline.length > 0 && (
              <section className="rounded-lg border p-4 lg:col-span-2">
                <h3 className="text-sm font-semibold">Evolução temporal</h3>
                <ol className="mt-3 space-y-3 border-l pl-4 text-sm">
                  {data.timeline.map((item, index) => (
                    <li key={`${item.date}-${index}`}>
                      <strong>
                        {item.date} — {item.reason}
                      </strong>
                      <p>{item.mainFinding}</p>
                      <p className="text-muted-foreground">
                        Conduta: {item.conduct || "Não registrada"} · Evolução:{" "}
                        {item.recordedEvolution || "Não registrada"}
                      </p>
                      <SourceLinks ids={item.sourceIds} sources={sources} />
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {data.alerts.length > 0 && (
              <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertTriangle className="size-4" /> Alertas para a consulta
                  atual
                </h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {data.alerts.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                      ⚠ {item.label} — {item.details}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.missingOrUncertainInformation.length > 0 && (
              <section className="rounded-lg border p-4">
                <h3 className="text-sm font-semibold">
                  Informações ausentes ou incertas
                </h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {data.missingOrUncertainInformation.map((item, index) => (
                    <li key={`${item.label}-${index}`}>
                      • {item.label}
                      {item.details ? ` — ${item.details}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        {data?.partiallyProcessed && (
          <p className="text-sm text-amber-700">
            O histórico foi parcialmente processado devido ao limite seguro de
            contexto.
          </p>
        )}
        <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <p>
            Resumo gerado por IA. Confirme as informações no prontuário
            original.
          </p>
          <p className="font-medium">
            Resumo de apoio clínico. Consulte os registros originais antes de
            tomar decisões.
          </p>
        </div>
      </div>

      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fontes do histórico</DialogTitle>
            <DialogDescription>
              Referências internas utilizadas na geração do resumo.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {sources.map((source) => (
              <li key={source.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {source.date} · {source.recordType}
                </p>
                <p className="text-xs text-muted-foreground">
                  {source.professional}
                </p>
                <p className="mt-2">
                  {source.excerpt || "Registro sem trecho textual necessário."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  className="mt-1 px-0"
                  render={<Link href={source.url} />}
                  nativeButton={false}
                >
                  Abrir registro original
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Fechar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </details>
  );
}
