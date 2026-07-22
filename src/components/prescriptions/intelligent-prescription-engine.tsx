"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Copy,
  FilePenLine,
  Heart,
  History,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PrescriptionMedicationEditor } from "@/components/prescriptions/prescription-medication-editor";
import { PrescriptionPreview } from "@/components/prescriptions/prescription-preview";
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { usePrescriptionEngine } from "@/hooks/use-prescription-engine";
import { useMedicationCatalogSearch } from "@/hooks/use-medication-catalog-search";
import { createEmptyMedication } from "@/lib/prescription-engine/prescription-factory";
import { optionsForForm } from "@/lib/prescription-engine/structured-options";
import { favoritePrescriptionTemplates } from "@/lib/prescription-engine/templates";
import { prescriptionConsistencyAlerts } from "@/lib/prescription-engine/validation";
import type {
  PrescriptionDocument,
  PrescriptionDraft,
  PrescriptionMedication,
  PrescriptionTemplate,
} from "@/lib/prescription-engine/types";
import type { MedicationCatalogResult } from "@/lib/medication-catalog/types";

type Identity = Omit<
  PrescriptionDocument,
  "id" | "status" | "type" | "medications" | "orientations" | "observations"
>;
type LibraryPanel = "favorites" | "recent" | "protocols" | null;

export function IntelligentPrescriptionEngine({
  disabled,
  currentValue,
  initialDraft,
  identity,
  onCommitDraft,
  onDraftChange,
  onIssue,
}: {
  disabled: boolean;
  currentValue: string;
  initialDraft?: PrescriptionDraft | null;
  identity: Identity;
  onCommitDraft: (value: string) => void;
  onDraftChange: (draft: PrescriptionDraft) => Promise<void>;
  onIssue: (
    document: PrescriptionDocument,
    idempotencyKey: string,
  ) => Promise<{ error?: string; id?: string }>;
}) {
  const engine = usePrescriptionEngine(identity, initialDraft);
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [panel, setPanel] = useState<LibraryPanel>(null);
  const [search, setSearch] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [editing, setEditing] = useState<PrescriptionMedication | null>(null);
  const [confirmTemplate, setConfirmTemplate] =
    useState<PrescriptionTemplate | null>(null);
  const [issueState, setIssueState] = useState<
    "idle" | "saving" | "generating"
  >("idle");
  const [issueError, setIssueError] = useState("");
  const [issuedDocumentId, setIssuedDocumentId] = useState<string | null>(null);
  const committedPreview = useRef("");
  const draftChangeCallback = useRef(onDraftChange);
  const idempotencyKey = useRef(crypto.randomUUID());
  const issuing = useRef(false);
  const catalog = useMedicationCatalogSearch(search);
  const consistencyAlerts = useMemo(
    () => prescriptionConsistencyAlerts(engine.document.medications),
    [engine.document.medications],
  );

  useEffect(() => {
    draftChangeCallback.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    if (disabled) return;
    const timer = window.setTimeout(
      () =>
        void draftChangeCallback.current({
          id: engine.document.id,
          type: engine.document.type,
          medications: engine.document.medications,
          orientations: engine.document.orientations,
          observations: engine.document.observations,
        }),
      800,
    );
    return () => window.clearTimeout(timer);
  }, [disabled, engine.document]);

  useEffect(() => {
    if (!engine.document.medications.length) {
      if (committedPreview.current) {
        committedPreview.current = "";
        onCommitDraft("");
      }
      return;
    }
    if (committedPreview.current === engine.preview) return;
    committedPreview.current = engine.preview;
    onCommitDraft(engine.preview);
  }, [engine.document.medications.length, engine.preview, onCommitDraft]);

  function beginMedication() {
    const name = search.trim();
    if (!name) return;
    setEditing({
      ...createEmptyMedication(),
      name,
      regulatorySource: "manual",
      manualEntry: true,
    });
    setSearch("");
  }

  function selectCatalogMedication(result: MedicationCatalogResult) {
    const formOptions = optionsForForm(result.pharmaceuticalForm ?? "");
    setEditing({
      ...createEmptyMedication(),
      name: result.productName,
      activeIngredient: result.activeIngredient ?? "",
      concentration: result.concentration ?? "",
      pharmaceuticalForm: result.pharmaceuticalForm ?? "",
      presentation: result.presentation ?? "",
      packageDescription: result.packageDescription ?? undefined,
      catalogPresentationId: result.presentationId ?? undefined,
      regulatorySource: result.presentationId
        ? "ANVISA_CMED"
        : "ANVISA_CATALOG",
      registrationNumber: result.registrationNumber ?? undefined,
      registrationHolder: result.registrationHolder ?? undefined,
      manufacturer:
        result.manufacturer ?? result.registrationHolder ?? undefined,
      manualEntry: !result.presentationId,
      ean: result.ean ?? undefined,
      sourceKey: result.sourceKey,
      sourceUpdatedAt: result.sourceUpdatedAt ?? undefined,
      route: formOptions.routes.length === 1 ? formOptions.routes[0] : "",
    });
    setSearch("");
  }

  async function commit() {
    if (issueState !== "idle" || issuing.current) return;
    issuing.current = true;
    const viewer = window.open("", "_blank");
    setIssueError("");
    setIssueState("saving");
    onCommitDraft(engine.preview);
    const result = await onIssue(
      { ...engine.document, status: "reviewed" },
      idempotencyKey.current,
    );
    if (result.error || !result.id) {
      viewer?.close();
      issuing.current = false;
      setIssueState("idle");
      setIssueError(result.error ?? "Não foi possível emitir a receita.");
      return;
    }
    setIssueState("generating");
    setIssuedDocumentId(result.id);
    setReviewOpen(false);
    idempotencyKey.current = crypto.randomUUID();
    toast.success("Receita emitida e armazenada com sucesso.");
    if (viewer) {
      viewer.opener = null;
      viewer.location.href = `/documentos/${result.id}/imprimir`;
    } else {
      window.location.assign(`/documentos/${result.id}/imprimir`);
    }
    setIssueState("idle");
    issuing.current = false;
  }

  function requestAi() {
    window.dispatchEvent(new CustomEvent("aster:open-prescription-ai"));
    toast.info(
      "A Prescrição IA foi aberta no Copilot. Revise cada sugestão antes de inserir.",
    );
  }

  const templates = favoritePrescriptionTemplates.filter((template) =>
    template.name.toLocaleLowerCase("pt-BR").includes(
      librarySearch.toLocaleLowerCase("pt-BR"),
    ),
  );

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-section="prescription"
      className="group scroll-mt-6 overflow-hidden rounded-lg border bg-card"
    >
      <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 [&::-webkit-details-marker]:hidden">
        <FilePenLine className="size-[18px] text-primary" />
        <span className="truncate text-sm font-semibold">Prescrição Médica</span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
          {engine.document.medications.length
            ? `${engine.document.medications.length} medicamento(s) no rascunho`
            : currentValue
              ? "Prescrição registrada no prontuário"
              : "Nenhum medicamento adicionado"}
        </span>
        <ChevronRight className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t p-3">
        <div className="mb-3 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            O catálogo Anvisa/CMED fornece dados regulatórios. Posologia, via e
            duração dependem de escolha e revisão profissional; não são
            recomendações clínicas automáticas.
          </p>
        </div>

        <div
          className={`grid min-w-0 gap-3 ${
            engine.document.medications.length
              ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]"
              : ""
          }`}
        >
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <LibraryButton icon={Heart} label="Favoritos" onClick={() => setPanel("favorites")} />
              <LibraryButton icon={History} label="Recentes" onClick={() => setPanel("recent")} />
              <LibraryButton icon={BookOpen} label="Protocolos" onClick={() => setPanel("protocols")} />
              <Button type="button" size="sm" variant="ghost" onClick={requestAi} disabled={disabled}>
                <Sparkles /> Sugerir Prescrição
              </Button>
            </div>

            {!editing && (
              <div className="relative">
                <div
                  className="relative"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && catalog.results.length) {
                      event.preventDefault();
                      setActiveSearchIndex((current) =>
                        Math.min(current + 1, catalog.results.length - 1),
                      );
                    } else if (event.key === "ArrowUp" && catalog.results.length) {
                      event.preventDefault();
                      setActiveSearchIndex((current) => Math.max(current - 1, 0));
                    } else if (event.key === "Escape") {
                      setSearch("");
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      const selected = catalog.results[activeSearchIndex];
                      if (selected) selectCatalogMedication(selected);
                      else beginMedication();
                    }
                  }}
                >
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    role="combobox"
                    aria-label="Pesquisar medicamento"
                    aria-autocomplete="list"
                    aria-controls="medication-catalog-results"
                    aria-activedescendant={activeSearchIndex >= 0 ? `medication-result-${activeSearchIndex}` : undefined}
                    aria-expanded={Boolean(search.trim().length >= 2)}
                    className="h-11 pr-24 pl-9 text-sm"
                    disabled={disabled}
                    value={search}
                    placeholder="Pesquisar medicamento..."
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setActiveSearchIndex(-1);
                    }}
                  />
                  <Button type="button" size="sm" className="absolute top-2 right-2" disabled={disabled || !search.trim()} onClick={beginMedication}>
                    Adicionar
                  </Button>
                </div>
                {search.trim().length >= 2 && (
                  <div
                    id="medication-catalog-results"
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
                  >
                    {catalog.loading ? (
                      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Pesquisando catálogo da Anvisa...
                      </div>
                    ) : catalog.results.length ? (
                      catalog.results.map((result, index) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected="false"
                          id={`medication-result-${index}`}
                          key={result.presentationId ?? result.sourceKey}
                          className={`w-full rounded-sm px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeSearchIndex === index ? "bg-muted" : ""}`}
                          onClick={() => selectCatalogMedication(result)}
                        >
                          <span className="block text-sm font-medium">
                            {[result.productName, result.concentration].filter(Boolean).join(" ")}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[
                              result.pharmaceuticalForm,
                              result.presentation,
                              result.manufacturer,
                              result.registrationNumber && `Registro ${result.registrationNumber}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-muted-foreground">
                        {catalog.error ?? "Nenhum registro ativo encontrado. Use Adicionar para inclusão manual."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {editing && (
              <PrescriptionMedicationEditor
                key={editing.id}
                disabled={disabled}
                initialMedication={editing}
                onSave={(medication) => {
                  const exists = engine.document.medications.some(
                    (item) => item.id === medication.id,
                  );
                  if (exists) engine.updateMedication(medication);
                  else engine.addMedication(medication);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            )}

            <section aria-labelledby="prescribed-medications-title">
              <div className="mb-2 flex items-center justify-between">
                <h4 id="prescribed-medications-title" className="text-xs font-semibold uppercase text-muted-foreground">
                  Medicamentos prescritos
                </h4>
                {engine.document.medications.length > 0 && (
                  <Badge variant="outline">{engine.document.medications.length}</Badge>
                )}
              </div>
              {engine.document.medications.length ? (
                <div className="space-y-2">
                  {engine.document.medications.map((item, index) => (
                    <MedicationCard
                      key={item.id}
                      item={item}
                      index={index}
                      count={engine.document.medications.length}
                      disabled={disabled}
                      onEdit={() => setEditing(item)}
                      onDuplicate={() => engine.duplicateMedication(item.id)}
                      onRemove={() => engine.removeMedication(item.id)}
                      onMove={(direction) => engine.moveMedication(item.id, direction)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed py-6 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum medicamento adicionado.</p>
                </div>
              )}
            </section>

            {consistencyAlerts.length > 0 && (
              <div role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold">Revisar possíveis duplicidades</p>
                <ul className="mt-1 space-y-1">
                  {consistencyAlerts.map((alert, index) => (
                    <li key={`${alert.code}-${index}`}>• {alert.message}</li>
                  ))}
                </ul>
                <p className="mt-2 text-muted-foreground">O alerta é documental e não bloqueia uma decisão clínica justificada.</p>
              </div>
            )}

            {engine.document.medications.length > 0 && (
              <Button type="button" disabled={disabled || Boolean(editing)} onClick={() => setReviewOpen(true)}>
                <FilePenLine /> Gerar Receita
              </Button>
            )}
          </div>

          {engine.document.medications.length > 0 && (
            <PrescriptionPreview document={engine.document} preview={engine.preview} />
          )}
        </div>
      </div>

      <LibraryDrawer
        panel={panel}
        setPanel={setPanel}
        search={librarySearch}
        setSearch={setLibrarySearch}
        templates={templates}
        currentMedications={engine.document.medications}
        onChoose={setConfirmTemplate}
      />

      <Dialog open={Boolean(confirmTemplate)} onOpenChange={(value) => !value && setConfirmTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar esta prescrição?</DialogTitle>
            <DialogDescription>Os medicamentos entrarão como rascunho e poderão ser editados antes da emissão.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {confirmTemplate?.medications.map((item) => <li key={item.id} className="flex gap-2"><span className="text-emerald-600">✓</span>{item.name}</li>)}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmTemplate(null)}>Cancelar</Button>
            <Button type="button" onClick={() => { if (confirmTemplate) engine.appendTemplate(confirmTemplate); setConfirmTemplate(null); setPanel(null); }}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar rascunho da receita</DialogTitle>
            <DialogDescription>Esta confirmação registra sua revisão médica, finaliza o documento e o vincula ao prontuário e à Timeline.</DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 font-sans text-xs leading-5">{engine.preview}</pre>
          {issueError && (
            <p role="alert" aria-live="assertive" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {issueError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={issueState !== "idle"}>Continuar editando</Button></DialogClose>
            <Button type="button" onClick={() => void commit()} disabled={issueState !== "idle"}>
              {issueState !== "idle" && <Loader2 className="animate-spin" />}
              {issueState === "saving"
                ? "Salvando receita..."
                : issueState === "generating"
                  ? "Gerando documento..."
                  : "Revisar e inserir no prontuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {issuedDocumentId && (
        <div className="mt-2 flex items-center justify-between rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm">
          <span>Receita emitida e disponível para reimpressão.</span>
          <Button type="button" size="sm" variant="outline" render={<a href={`/documentos/${issuedDocumentId}/imprimir`} target="_blank" rel="noreferrer" />} nativeButton={false}>
            <ExternalLink /> Visualizar
          </Button>
        </div>
      )}
    </details>
  );
}

function LibraryButton({ icon: Icon, label, onClick }: { icon: typeof Heart; label: string; onClick: () => void }) {
  return <Button type="button" size="sm" variant="outline" onClick={onClick}><Icon />{label}</Button>;
}

function MedicationCard({ item, index, count, disabled, onEdit, onDuplicate, onRemove, onMove }: { item: PrescriptionMedication; index: number; count: number; disabled: boolean; onEdit: () => void; onDuplicate: () => void; onRemove: () => void; onMove: (direction: -1 | 1) => void }) {
  return <article className="flex min-w-0 items-start justify-between gap-3 rounded-md border bg-background p-3">
    <div className="min-w-0">
      <strong className="block truncate text-sm">{item.name}{item.concentration ? ` ${item.concentration}` : ""}</strong>
      <p className="mt-1 break-words text-xs text-muted-foreground">{[item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(" · ")}</p>
    </div>
    <div className="flex shrink-0 gap-0.5">
      <Button type="button" size="icon-xs" variant="ghost" disabled={disabled || index === 0} aria-label={`Mover ${item.name} para cima`} onClick={() => onMove(-1)}><ArrowUp /></Button>
      <Button type="button" size="icon-xs" variant="ghost" disabled={disabled || index === count - 1} aria-label={`Mover ${item.name} para baixo`} onClick={() => onMove(1)}><ArrowDown /></Button>
      <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} aria-label={`Editar ${item.name}`} onClick={onEdit}><Pencil /></Button>
      <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} aria-label={`Duplicar ${item.name}`} onClick={onDuplicate}><Copy /></Button>
      <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} aria-label={`Excluir ${item.name}`} onClick={onRemove}><Trash2 /></Button>
    </div>
  </article>;
}

function LibraryDrawer({ panel, setPanel, search, setSearch, templates, currentMedications, onChoose }: { panel: LibraryPanel; setPanel: (panel: LibraryPanel) => void; search: string; setSearch: (value: string) => void; templates: PrescriptionTemplate[]; currentMedications: PrescriptionMedication[]; onChoose: (template: PrescriptionTemplate) => void }) {
  const title = panel === "favorites" ? "Favoritos" : panel === "protocols" ? "Protocolos" : "Recentes";
  const description = panel === "favorites" ? "Prescrições pessoais salvas." : panel === "protocols" ? "Conjuntos padronizados disponíveis." : "Medicamentos usados neste rascunho.";
  const recentTemplate: PrescriptionTemplate | null = currentMedications.length ? { id: "current-session", name: "Rascunho atual", scope: "personal", type: "simple", medications: currentMedications, orientations: "", observations: "" } : null;
  const visible = panel === "recent" ? (recentTemplate ? [recentTemplate] : []) : templates;
  return <Drawer open={Boolean(panel)} onOpenChange={(value) => !value && setPanel(null)}>
    <DrawerContent side="right" className="w-full sm:max-w-sm">
      <DrawerHeader><DrawerTitle>{title}</DrawerTitle><DrawerDescription>{description}</DrawerDescription></DrawerHeader>
      <div className="relative mb-4"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Pesquisar ${title.toLocaleLowerCase("pt-BR")}...`} /></div>
      {panel !== "recent" && <div className="mb-3 flex gap-1.5"><Badge variant="outline">Pessoais</Badge><Badge variant="outline">Categorias</Badge></div>}
      {visible.length ? <div className="space-y-2">{visible.map((template) => <button type="button" key={template.id} className="w-full rounded-md border p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => onChoose(template)}><strong className="text-sm">{template.name}</strong><p className="mt-1 text-xs text-muted-foreground">{template.medications.map((item) => item.name).join(", ")}</p></button>)}</div> : <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">Nenhum item disponível.</p>}
    </DrawerContent>
  </Drawer>;
}
