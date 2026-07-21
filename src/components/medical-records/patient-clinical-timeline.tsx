"use client";

import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FileText,
  Search,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  MedicalRecordAppointment,
  MedicalRecordHistoryItem,
} from "@/lib/medical-records/types";
import {
  buildPatientTimelineContext,
  buildPatientTimelineEvents,
  type PatientTimelineDocument,
  type PatientTimelineEvent,
} from "@/lib/medical-records/patient-timeline";

type Filter = "all" | PatientTimelineEvent["kind"];

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "consultation", label: "Consultas" },
  { value: "exam", label: "Exames" },
  { value: "prescription", label: "Prescrições" },
  { value: "referral", label: "Encaminhamentos" },
  { value: "certificate", label: "Atestados" },
  { value: "document", label: "Documentos" },
];

function eventIcon(kind: PatientTimelineEvent["kind"]) {
  if (kind === "consultation") return <Stethoscope />;
  if (kind === "document") return <FileText />;
  return <ClipboardList />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

export function PatientClinicalTimeline({
  appointment,
  history,
  documents,
  addenda = [],
}: {
  appointment: MedicalRecordAppointment;
  history: MedicalRecordHistoryItem[];
  documents: PatientTimelineDocument[];
  addenda?: Array<{ id:string; content:string; reason:string; created_at:string }>;
}) {
  const storageKey = `aster:patient-timeline:${appointment.id}:expanded`;
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(storageKey) === "true";
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);

  const events = useMemo(
    () => buildPatientTimelineEvents(history, documents, addenda),
    [addenda, documents, history],
  );
  const context = useMemo(
    () => buildPatientTimelineContext(appointment, history, events),
    [appointment, events, history],
  );

  useEffect(() => {
    window.sessionStorage.setItem(storageKey, String(expanded));
  }, [expanded, storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const normalizedQuery = debouncedQuery.toLocaleLowerCase("pt-BR");
    return events.filter(
      (event) =>
        (filter === "all" || event.kind === filter) &&
        (!normalizedQuery || event.searchableText.includes(normalizedQuery)),
    );
  }, [debouncedQuery, events, filter]);

  const latestConsultation = history[0];
  const latestPrescription = history.find((item) =>
    item.prescription?.trim(),
  )?.prescription;
  const alert = context.allergies[0] || context.recurringDiagnoses[0] || null;

  return (
    <section
      className="rounded-lg border border-primary/20 bg-card shadow-sm"
      aria-labelledby="patient-timeline-title"
    >
      <div className="flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" aria-hidden="true" />
          <h2 id="patient-timeline-title" className="font-semibold">
            Histórico Clínico
          </h2>
        </div>
        <span className="text-sm text-muted-foreground">
          Último atendimento:{" "}
          {latestConsultation
            ? formatDate(latestConsultation.appointment_date)
            : "—"}
        </span>
        <span className="text-sm text-muted-foreground">
          {history.length} atendimento(s) anterior(es)
        </span>
        {latestConsultation?.assessment && (
          <Badge variant="outline" className="max-w-48 truncate">
            {latestConsultation.assessment}
          </Badge>
        )}
        {latestPrescription && (
          <span className="max-w-52 truncate text-sm text-muted-foreground">
            Última prescrição: {latestPrescription}
          </span>
        )}
        {alert && (
          <span className="flex max-w-56 items-center gap-1 truncate text-sm text-amber-700">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {alert}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          aria-expanded={expanded}
          aria-controls="patient-timeline-content"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Recolher histórico" : "Expandir histórico"}
          <ChevronDown
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          render={
            <Link href={`/patients/${appointment.patient_id}/longitudinal`} />
          }
          nativeButton={false}
        >
          Visão longitudinal
        </Button>
      </div>

      {expanded && (
        <div id="patient-timeline-content" className="space-y-4 border-t p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/35 p-3 text-sm">
            <span>
              <strong>Alergias:</strong>{" "}
              {context.allergies.join("; ") || "Não registradas"}
            </span>
            <span>
              <strong>Uso contínuo:</strong>{" "}
              {context.continuousMedications.join("; ") || "Não registrado"}
            </span>
            {context.recurringDiagnoses.length > 0 && (
              <span>
                <strong>Diagnósticos recorrentes:</strong>{" "}
                {context.recurringDiagnoses.join("; ")}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Pesquisar histórico</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(10);
                }}
                placeholder="Pesquisar histórico..."
                className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <div
              className="flex gap-1 overflow-x-auto pb-1"
              aria-label="Filtrar timeline"
            >
              {filters.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="xs"
                  variant={filter === item.value ? "secondary" : "ghost"}
                  className="shrink-0 whitespace-nowrap"
                  aria-pressed={filter === item.value}
                  onClick={() => {
                    setFilter(item.value);
                    setVisibleCount(10);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          {!events.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum atendimento anterior encontrado para este paciente.
            </p>
          ) : !filtered.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum evento corresponde à busca ou ao filtro selecionado.
            </p>
          ) : (
            <ol className="space-y-2">
              {filtered.slice(0, visibleCount).map((event) => (
                <li key={event.id}>
                  <details className="group rounded-lg border bg-background">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
                        {eventIcon(event.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {formatDate(event.date)}
                          {event.time ? ` • ${event.time}` : ""} — {event.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[event.professional, event.status]
                            .filter(Boolean)
                            .join(" • ")}
                        </span>
                      </span>
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 border-t p-3">
                      {event.details.map((detail) => (
                        <div key={`${event.id}:${detail.label}`}>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {detail.label}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm">
                            {detail.value}
                          </p>
                        </div>
                      ))}
                      {event.href && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          render={<Link href={event.href} />}
                          nativeButton={false}
                        >
                          Visualizar atendimento completo
                        </Button>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}

          {visibleCount < filtered.length && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibleCount((count) => count + 10)}
            >
              Carregar mais
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
