"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileDown,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createClinicalDocument,
  saveClinicalDocument,
} from "@/app/(dashboard)/documentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useExamCatalogSearch } from "@/hooks/use-exam-catalog-search";
import { useExamOrder } from "@/hooks/use-exam-order";
import type { ExamOrderDocumentIdentity } from "@/lib/clinical-plan/exam-order-generator";
import { examOrderPackages } from "@/lib/clinical-plan/exam-order-packages";
import { mockExamCatalog } from "@/lib/clinical-plan/mock-exam-catalog";
import type {
  ExamOrder,
  ExamOrderCategory,
  ExamOrderItemType,
  OrderPriority,
} from "@/lib/clinical-plan/types";

const categories: ExamOrderCategory[] = [
  "Exames laboratoriais",
  "Exames de imagem",
  "Exames cardiológicos",
  "Exames neurológicos",
  "Exames endoscópicos",
  "Exames anatomopatológicos",
  "Testes funcionais",
  "Procedimentos diagnósticos",
  "Outros",
];
const priorities: Array<[OrderPriority, string]> = [
  ["routine", "Rotina"],
  ["priority", "Prioritário"],
  ["urgent", "Urgente"],
];
const guidanceExamples = [
  "Jejum conforme orientação do laboratório",
  "Manter hidratação habitual",
  "Comparecer com acompanhante",
  "Levar exames anteriores",
  "Chegar com antecedência",
];

function blankItem(): ExamOrder {
  return {
    id: crypto.randomUUID(),
    name: "",
    category: "Outros",
    type: "exam",
    clinicalIndication: "",
    priority: "routine",
    guidance: "",
    observations: "",
    diagnosisRef: "",
    expectedDate: "",
    status: "draft",
  };
}

function previousItems(text: string): ExamOrder[] {
  return text
    .split("\n")
    .map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1]?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ ...blankItem(), name }));
}

export interface PreviousExamOrder {
  date: string;
  professional: string;
  text: string;
}

export function ExamOrderSection({
  appointmentId,
  disabled,
  items,
  onItemsChange,
  onMetadataChange,
  diagnoses,
  identity,
  previousOrders,
  onSaveToEncounter,
}: {
  appointmentId: string;
  disabled: boolean;
  items: ExamOrder[];
  onItemsChange: (items: ExamOrder[]) => void;
  onMetadataChange: (metadata: {
    examOrderGeneralIndication: string;
    examOrderGeneralGuidance: string;
    examOrderDiagnosisRef: string;
  }) => void;
  diagnoses: string[];
  identity: ExamOrderDocumentIdentity;
  previousOrders: PreviousExamOrder[];
  onSaveToEncounter: () => void;
}) {
  const router = useRouter();
  const order = useExamOrder({ items, onItemsChange, identity });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ExamOrderCategory | "all">("all");
  const [draft, setDraft] = useState(blankItem);
  const [editing, setEditing] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const search = useExamCatalogSearch(query);
  const filteredResults = useMemo(
    () =>
      search.results.filter(
        (item) => category === "all" || item.category === category,
      ),
    [category, search.results],
  );
  const selectedPackage = examOrderPackages.find(
    (item) => item.id === packageId,
  );
  const packageItems = selectedPackage
    ? mockExamCatalog.filter((item) =>
        selectedPackage.itemIds.includes(item.id),
      )
    : [];

  function syncMetadata(
    values: Partial<{
      indication: string;
      diagnosis: string;
      guidance: string;
    }>,
  ) {
    const indication = values.indication ?? order.generalClinicalIndication;
    const diagnosis = values.diagnosis ?? order.generalDiagnosisRef;
    const guidance = values.guidance ?? order.generalGuidance;
    if (values.indication !== undefined)
      order.setGeneralClinicalIndication(values.indication);
    if (values.diagnosis !== undefined)
      order.setGeneralDiagnosisRef(values.diagnosis);
    if (values.guidance !== undefined)
      order.setGeneralGuidance(values.guidance);
    onMetadataChange({
      examOrderGeneralIndication: indication,
      examOrderDiagnosisRef: diagnosis,
      examOrderGeneralGuidance: guidance,
    });
  }

  function selectCatalogItem(item: (typeof mockExamCatalog)[number]) {
    const added = order.add({
      ...blankItem(),
      name: item.name,
      category: item.category,
      type: item.type,
    });
    if (!added) return toast.info("Este item já foi adicionado.");
    setQuery("");
    toast.success(`${item.name} adicionado.`);
  }

  function saveItem() {
    if (!draft.name.trim()) return toast.error("Informe o nome do item.");
    if (editing) order.update(draft);
    else if (!order.add(draft))
      return toast.info("Este item já foi adicionado.");
    setDraft(blankItem());
    setEditing(false);
  }

  function addPackage() {
    if (!selectedPackage || !packageItems.length) return;
    if (
      !window.confirm(
        `Adicionar ${packageItems.length} item(ns) do pacote “${selectedPackage.name}”? Revise cada item antes de salvar no Atendimento.`,
      )
    )
      return;
    const next = [...items];
    packageItems.forEach((item) => {
      if (
        !next.some(
          (entry) =>
            entry.name.toLocaleLowerCase("pt-BR") ===
            item.name.toLocaleLowerCase("pt-BR"),
        )
      )
        next.push({
          ...blankItem(),
          name: item.name,
          category: item.category,
          type: item.type,
        });
    });
    onItemsChange(next);
    setPackageId("");
    toast.success("Pacote adicionado como rascunho para revisão.");
  }

  function duplicatePrevious(previous: PreviousExamOrder) {
    const parsed = previousItems(previous.text);
    if (!parsed.length)
      return toast.error(
        "A solicitação anterior não possui itens estruturados reutilizáveis.",
      );
    if (
      !window.confirm(
        `Criar uma nova solicitação com ${parsed.length} item(ns) de ${new Date(`${previous.date}T12:00:00`).toLocaleDateString("pt-BR")}? Datas e indicação clínica não serão copiadas.`,
      )
    )
      return;
    const next = [...items];
    parsed.forEach((item) => {
      if (
        !next.some(
          (entry) =>
            entry.name.toLocaleLowerCase("pt-BR") ===
            item.name.toLocaleLowerCase("pt-BR"),
        )
      )
        next.push(item);
    });
    onItemsChange(next);
    toast.success("Nova solicitação criada para revisão.");
  }

  async function createDocument() {
    if (!items.length)
      return toast.error("Adicione ao menos um exame ou procedimento.");
    if (!identity.patientName.trim())
      return toast.error("Paciente não identificado.");
    if (!identity.professionalName.trim())
      return toast.error("Profissional responsável não identificado.");
    setSavingDocument(true);
    const created = await createClinicalDocument(appointmentId, "exam_request");
    if ("error" in created) {
      setSavingDocument(false);
      return toast.error(created.error);
    }
    const saved = await saveClinicalDocument(
      created.id,
      order.preview.title,
      {
        exams: items.map((item) => item.name).join("\n"),
        clinical_indication: order.generalClinicalIndication,
        diagnostic_hypothesis: order.generalDiagnosisRef,
        cid: items
          .map((item) => item.diagnosisRef)
          .filter(Boolean)
          .join("\n"),
        priority: [
          ...new Set(
            items.map(
              (item) =>
                priorities.find(([value]) => value === item.priority)?.[1],
            ),
          ),
        ]
          .filter(Boolean)
          .join(", "),
        observations: order.generalGuidance,
        body: order.preview.body,
      },
      [],
    );
    setSavingDocument(false);
    if ("error" in saved) return toast.error(saved.error);
    setDocumentId(created.id);
    router.refresh();
    toast.success("Rascunho registrado na Central de Documentos.");
  }

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)]">
      <div className="min-w-0 space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <label className="text-xs font-medium">
            Pesquisar exame...
            <div className="relative mt-1">
              {search.loading ? (
                <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
              ) : (
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <Input
                className="pl-9"
                disabled={disabled}
                value={query}
                placeholder="Pesquisar exame..."
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </label>
          <label className="text-xs font-medium">
            Categoria
            <Select
              className="mt-1"
              disabled={disabled}
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ExamOrderCategory | "all")
              }
            >
              <option value="all">Todas</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </label>
        </div>
        <div aria-live="polite" className="space-y-1">
          {!query.trim() && (
            <p className="text-xs text-muted-foreground">
              Pesquise no catálogo local ou preencha um item manualmente.
            </p>
          )}
          {query && !search.loading && !filteredResults.length && (
            <p className="text-xs text-muted-foreground">
              Nenhum resultado encontrado.
            </p>
          )}
          {filteredResults.map((item) => {
            const added = items.some(
              (entry) =>
                entry.name.toLocaleLowerCase("pt-BR") ===
                item.name.toLocaleLowerCase("pt-BR"),
            );
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled || added}
                onClick={() => selectCatalogItem(item)}
                className="flex w-full items-center justify-between rounded-md border p-2 text-left text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span>
                  <strong>{item.name}</strong>
                  <span className="block text-muted-foreground">
                    {item.category} ·{" "}
                    {item.type === "exam" ? "Exame" : "Procedimento"}
                    {item.abbreviation ? ` · ${item.abbreviation}` : ""}
                  </span>
                </span>
                <span className="font-medium text-primary">
                  {added ? "Já adicionado" : "Adicionar"}
                </span>
              </button>
            );
          })}
        </div>

        <details id="exam-advanced-editor" className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
            Adicionar manualmente ou editar detalhes
            <Plus className="size-4 transition-transform group-open:rotate-45" />
          </summary>
          <section className="border-t p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">
              Nome
              <Input
                className="mt-1"
                disabled={disabled}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs font-medium">
              Categoria
              <Select
                className="mt-1"
                disabled={disabled}
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as ExamOrderCategory,
                  }))
                }
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium">
              Tipo
              <Select
                className="mt-1"
                disabled={disabled}
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as ExamOrderItemType,
                  }))
                }
              >
                <option value="exam">Exame</option>
                <option value="diagnostic_procedure">
                  Procedimento diagnóstico
                </option>
              </Select>
            </label>
            <label className="text-xs font-medium">
              Prioridade
              <Select
                className="mt-1"
                disabled={disabled}
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as OrderPriority,
                  }))
                }
              >
                {priorities.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium">
              Indicação específica
              <Input
                className="mt-1"
                disabled={disabled}
                value={draft.clinicalIndication}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    clinicalIndication: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs font-medium">
              Diagnóstico ou CID
              <Select
                className="mt-1"
                disabled={disabled}
                value={draft.diagnosisRef}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    diagnosisRef: event.target.value,
                  }))
                }
              >
                <option value="">Não vinculado</option>
                {diagnoses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium">
              Orientação
              <Input
                className="mt-1"
                disabled={disabled}
                value={draft.guidance}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    guidance: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs font-medium">
              Observações
              <Input
                className="mt-1"
                disabled={disabled}
                value={draft.observations}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    observations: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs font-medium">
              Data prevista
              <Input
                className="mt-1"
                type="date"
                disabled={disabled}
                value={draft.expectedDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expectedDate: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={disabled}
            onClick={saveItem}
          >
            {editing ? <Check /> : <Plus />}
            {editing ? "Salvar alterações" : "Adicionar item"}
          </Button>
          </section>
        </details>

        <div className="space-y-2">
          {items.length ? (
            items.map((item, index) => (
              <article
                key={item.id}
                className="rounded-lg border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs">
                    <strong>
                      {index + 1}. {item.name}
                    </strong>
                    <p className="text-muted-foreground">
                      {item.category} ·{" "}
                      {
                        priorities.find(
                          ([value]) => value === item.priority,
                        )?.[1]
                      }
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled || index === 0}
                      aria-label={`Mover ${item.name} para cima`}
                      onClick={() => order.move(item.id, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled || index === items.length - 1}
                      aria-label={`Mover ${item.name} para baixo`}
                      onClick={() => order.move(item.id, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={`Editar ${item.name}`}
                      onClick={() => {
                        setDraft(item);
                        setEditing(true);
                        const editor = document.querySelector<HTMLDetailsElement>(
                          "#exam-advanced-editor",
                        );
                        if (editor) editor.open = true;
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={`Duplicar ${item.name}`}
                      onClick={() => order.duplicate(item.id)}
                    >
                      <Copy />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={`Remover ${item.name}`}
                      onClick={() => {
                        const detailed =
                          item.clinicalIndication.trim() ||
                          item.observations.trim();
                        if (
                          detailed &&
                          !window.confirm(
                            `Remover “${item.name}” com informações preenchidas?`,
                          )
                        )
                          return;
                        order.remove(item.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
              Nenhum exame ou procedimento selecionado.
            </p>
          )}
        </div>

        <section className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Indicação clínica geral
            <Input
              className="mt-1"
              disabled={disabled}
              value={order.generalClinicalIndication}
              onChange={(event) =>
                syncMetadata({ indication: event.target.value })
              }
            />
          </label>
          <label className="text-xs font-medium">
            Diagnóstico geral relacionado
            <Select
              className="mt-1"
              disabled={disabled}
              value={order.generalDiagnosisRef}
              onChange={(event) =>
                syncMetadata({ diagnosis: event.target.value })
              }
            >
              <option value="">Não vinculado</option>
              {diagnoses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-medium sm:col-span-2">
            Orientações gerais
            <Input
              className="mt-1"
              disabled={disabled}
              value={order.generalGuidance}
              onChange={(event) =>
                syncMetadata({ guidance: event.target.value })
              }
            />
          </label>
          <div className="flex flex-wrap gap-1 sm:col-span-2">
            {guidanceExamples.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => syncMetadata({ guidance: item })}
              >
                {item}
              </Button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="text-xs font-medium">
              Pacotes demonstrativos
              <Select
                className="mt-1"
                disabled={disabled}
                value={packageId}
                onChange={(event) => setPackageId(event.target.value)}
              >
                <option value="">Selecione para revisar</option>
                {examOrderPackages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              type="button"
              size="sm"
              className="self-end"
              disabled={disabled || !selectedPackage}
              onClick={addPackage}
            >
              <Plus /> Revisar e adicionar
            </Button>
          </div>
          {selectedPackage && (
            <div className="mt-2 rounded-md bg-muted/30 p-2 text-xs">
              <strong>{selectedPackage.name}</strong>
              <p className="text-muted-foreground">
                {selectedPackage.description}
              </p>
              <ul className="mt-1">
                {packageItems.map((item) => (
                  <li key={item.id}>• {item.name}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2"
            disabled
            title="Em breve"
          >
            <Star /> Salvar como favorito · Em breve
          </Button>
        </section>

        {previousOrders.length > 0 && (
          <details className="group rounded-lg border">
            <summary className="cursor-pointer list-none p-3 text-xs font-semibold [&::-webkit-details-marker]:hidden">
              Duplicar solicitação anterior
            </summary>
            <div className="space-y-2 border-t p-3">
              {previousOrders.map((previous) => (
                <article
                  key={`${previous.date}-${previous.professional}`}
                  className="rounded-md border p-2 text-xs"
                >
                  <strong>
                    {new Date(`${previous.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}{" "}
                    · {previous.professional}
                  </strong>
                  <pre className="mt-1 line-clamp-4 whitespace-pre-wrap font-sans text-muted-foreground">
                    {previous.text}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={disabled}
                    onClick={() => duplicatePrevious(previous)}
                  >
                    <Copy /> Duplicar para revisão
                  </Button>
                </article>
              ))}
            </div>
          </details>
        )}
      </div>

      <aside className="h-fit rounded-lg border border-primary/25 bg-background p-3 xl:sticky xl:top-12">
        <h4 className="text-sm font-semibold">
          Pré-visualização da Solicitação
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Atualização automática · documento institucional
        </p>
        <pre className="mt-3 max-h-[34rem] overflow-auto whitespace-pre-wrap font-sans text-xs leading-5">
          {order.preview.body || "Nenhum item selecionado."}
        </pre>
        <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
          <Button
            type="button"
            size="sm"
            disabled={disabled || !items.length}
            onClick={onSaveToEncounter}
          >
            <Save /> Adicionar à Conduta
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!items.length}
            onClick={() => {
              void navigator.clipboard.writeText(order.preview.body);
              toast.success("Solicitação copiada.");
            }}
          >
            <Copy /> Copiar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || !items.length || savingDocument}
            onClick={createDocument}
          >
            {savingDocument ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FilePlus2 />
            )}
            Central de Documentos
          </Button>
          {documentId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              render={
                <a
                  href={`/documentos/${documentId}/imprimir`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
            >
              <Printer /> Imprimir
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled
            title="PDF específico em breve"
          >
            <FileDown /> PDF · Em breve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || !items.length}
            onClick={() => {
              if (
                !window.confirm(
                  "Cancelar a edição e remover os itens ainda não salvos desta solicitação?",
                )
              )
                return;
              onItemsChange([]);
              syncMetadata({ indication: "", diagnosis: "", guidance: "" });
            }}
          >
            Cancelar edição
          </Button>
        </div>
      </aside>
    </div>
  );
}
