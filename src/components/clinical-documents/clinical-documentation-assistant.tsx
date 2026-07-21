"use client";

import {
  Bold,
  CheckSquare,
  Clipboard,
  FileText,
  Italic,
  List,
  Loader2,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  acceptClinicalAiSections,
  discardClinicalAiSuggestion,
  generateClinicalAiSuggestion,
} from "@/app/(dashboard)/consultas/clinical-ai-actions";
import {
  createClinicalDocument,
  saveClinicalDocument,
} from "@/app/(dashboard)/documentos/actions";
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
import type { ClinicalAiSuggestion } from "@/lib/ai/clinical-schema";
import type { ClinicalAiRequestType } from "@/lib/ai/clinical-assistant";
import type { ClinicalDocumentType } from "@/lib/clinical-documents/types";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

const documentKinds = [
  ["soap", "SOAP"],
  ["evolution", "Evolução médica"],
  ["clinical_summary", "Resumo clínico"],
  ["discharge_summary", "Resumo para alta"],
  ["prescription", "Prescrição (rascunho)"],
  ["exam_request", "Solicitação de exames"],
  ["referral", "Encaminhamento"],
  ["certificate", "Atestado"],
  ["attendance", "Declaração de comparecimento"],
  ["reference", "Carta de referência"],
  ["counter_reference", "Carta de contrarreferência"],
  ["medical_report", "Relatório médico"],
] as const;

type DocumentationKind = (typeof documentKinds)[number][0];
type DraftVersion = {
  id: string;
  kind: DocumentationKind;
  label: string;
  content: string;
  createdAt: string;
  generationId: string | null;
};

const requestFor: Partial<Record<DocumentationKind, ClinicalAiRequestType>> = {
  soap: "soap",
  evolution: "complete_analysis",
  clinical_summary: "structured_anamnesis",
  discharge_summary: "conduct",
  exam_request: "exams",
  referral: "conduct",
  reference: "complete_analysis",
  counter_reference: "complete_analysis",
  medical_report: "complete_analysis",
};

const persistedType: Partial<Record<DocumentationKind, ClinicalDocumentType>> = {
  exam_request: "exam_request",
  referral: "referral",
  certificate: "medical_certificate",
  attendance: "attendance_declaration",
};

function consultationText(values: MedicalRecordFormValues) {
  return [
    ["Queixa principal", values.chief_complaint],
    ["HDA", values.hpi],
    ["Antecedentes", values.pmh],
    ["Medicações", values.medications],
    ["Alergias", values.allergies],
    ["História familiar", values.family_history],
    ["Hábitos", values.social_history],
    ["Sinais vitais", values.vital_signs],
    ["Exame físico", values.physical_exam],
    ["Hipóteses", values.assessment],
    ["CID", values.cid10],
    ["Conduta", values.plan],
    ["Prescrição registrada", values.prescription],
    ["Exames solicitados", values.exam_requests],
    ["Orientações", values.guidance],
    ["Retorno", values.return_guidance],
  ]
    .filter(([, value]) => value?.trim())
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n");
}

function formatSuggestion(kind: DocumentationKind, suggestion: ClinicalAiSuggestion) {
  const sections = (items: Array<[string, string]>) =>
    items.filter(([, value]) => value.trim()).map(([title, value]) => `${title}\n${value.trim()}`).join("\n\n");
  if (kind === "soap") return sections([["S — SUBJETIVO", suggestion.hpi], ["O — OBJETIVO", suggestion.physicalExam], ["A — AVALIAÇÃO", suggestion.clinicalAssessment], ["P — PLANO", suggestion.plan]]);
  if (kind === "exam_request") return sections([["EXAMES COMPLEMENTARES", suggestion.suggestedExams], ["JUSTIFICATIVA E LIMITAÇÕES", suggestion.alertsAndMissingInformation]]);
  if (kind === "referral") return sections([["ESPECIALIDADE / DESTINO", "A definir pelo profissional"], ["MOTIVO E RESUMO CLÍNICO", suggestion.clinicalAssessment], ["PERGUNTA CLÍNICA", suggestion.plan]]);
  if (kind === "clinical_summary") return sections([["RESUMO CLÍNICO", suggestion.hpi], ["ANTECEDENTES RELEVANTES", suggestion.personalHistory], ["AVALIAÇÃO", suggestion.clinicalAssessment], ["ORIENTAÇÕES", suggestion.guidance]]);
  if (kind === "discharge_summary") return sections([["SITUAÇÃO CLÍNICA", suggestion.clinicalAssessment], ["CONDUTA", suggestion.plan], ["ORIENTAÇÕES E SINAIS DE ALARME", suggestion.guidance], ["ACOMPANHAMENTO", suggestion.followUp]]);
  if (kind === "evolution") return sections([["EVOLUÇÃO MÉDICA", suggestion.hpi], ["EXAME", suggestion.physicalExam], ["AVALIAÇÃO", suggestion.clinicalAssessment], ["CONDUTA", suggestion.plan]]);
  if (kind === "reference" || kind === "counter_reference") return sections([[kind === "reference" ? "CARTA DE REFERÊNCIA" : "CARTA DE CONTRARREFERÊNCIA", suggestion.hpi], ["RESUMO CLÍNICO", suggestion.clinicalAssessment], ["CONDUTA REALIZADA", suggestion.plan], ["INFORMAÇÕES PARA CONTINUIDADE DO CUIDADO", suggestion.followUp]]);
  return sections([["HISTÓRIA", suggestion.hpi], ["EXAME", suggestion.physicalExam], ["HIPÓTESE", suggestion.clinicalAssessment], ["CONDUTA", suggestion.plan], ["SITUAÇÃO ATUAL", suggestion.followUp]]);
}

function structuralDraft(kind: DocumentationKind, values: MedicalRecordFormValues) {
  if (kind === "certificate") return `ATESTADO MÉDICO\n\nDeclaro, para os devidos fins, que o(a) paciente esteve sob atendimento médico nesta data.\n\nPeríodo de afastamento: A definir pelo profissional.\nCID: Somente mediante autorização e confirmação do profissional.\n\nLocal e data: A confirmar.`;
  if (kind === "attendance") return `DECLARAÇÃO DE COMPARECIMENTO\n\nDeclaro, para os devidos fins, o comparecimento do(a) paciente para atendimento nesta data.\n\nHorário de entrada: A confirmar.\nHorário de saída: A confirmar.\n\nLocal e data: A confirmar.`;
  if (kind === "prescription") {
    const sufficient = Boolean(values.chief_complaint?.trim() && values.allergies?.trim() && values.medications?.trim() && values.assessment?.trim());
    return sufficient
      ? "A prescrição assistida deve ser elaborada e validada na aba Prescrição IA, com aceite individual dos medicamentos."
      : "Dados insuficientes para elaborar sugestão segura. Confirme idade, peso quando necessário, alergias, medicações atuais e indicação clínica no módulo Prescrição IA.";
  }
  return "";
}

function applyFormatting(textarea: HTMLTextAreaElement | null, content: string, setContent: (value: string) => void, mode: "bold" | "italic" | "list") {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = content.slice(start, end);
  const replacement = mode === "bold" ? `**${selected || "texto"}**` : mode === "italic" ? `_${selected || "texto"}_` : (selected || "item").split("\n").map((line) => `- ${line}`).join("\n");
  setContent(`${content.slice(0, start)}${replacement}${content.slice(end)}`);
  window.setTimeout(() => textarea.focus(), 0);
}

export function ClinicalDocumentationAssistant({ appointmentId, canCreate, getFormValues }: {
  appointmentId: string;
  canCreate: boolean;
  getFormValues: () => MedicalRecordFormValues;
}) {
  const router = useRouter();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentationKind[]>(["soap", "evolution", "clinical_summary"]);
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const active = versions.find((item) => item.id === activeId) ?? versions[0] ?? null;
  const groupedVersions = useMemo(() => documentKinds.map(([kind, label]) => ({ kind, label, items: versions.filter((item) => item.kind === kind) })).filter((group) => group.items.length), [versions]);

  function replaceActive(content: string) {
    if (!active) return;
    setVersions((current) => current.map((item) => item.id === active.id ? { ...item, content } : item));
  }

  function updateActive(content: string) {
    if (!active || content === active.content) return;
    setUndoStack((current) => [...current.slice(-49), active.content]);
    setRedoStack([]);
    replaceActive(content);
  }

  function undo() {
    if (!active || !undoStack.length) return;
    const previous = undoStack.at(-1) || "";
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, active.content]);
    replaceActive(previous);
  }

  function redo() {
    if (!active || !redoStack.length) return;
    const next = redoStack.at(-1) || "";
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, active.content]);
    replaceActive(next);
  }

  async function generate() {
    const values = getFormValues();
    const text = consultationText(values);
    if (text.length < 30) return setError("Conteúdo clínico insuficiente. Registre ao menos 30 caracteres antes de gerar documentos.");
    setLoading(true); setError(""); setProgress(0);
    const requests = selected.map(async (kind, index) => {
      const label = documentKinds.find(([value]) => value === kind)?.[1] || kind;
      const requestType = requestFor[kind];
      if (!requestType) {
        const content = structuralDraft(kind, values);
        setProgress(index + 1);
        return { kind, label, content, generationId: null };
      }
      const result = await generateClinicalAiSuggestion({ appointmentId, text, requestType });
      setProgress((current) => current + 1);
      if (result.error || !result.suggestion) throw new Error(`${label}: ${result.error || "Resposta indisponível."}`);
      return { kind, label, content: formatSuggestion(kind, result.suggestion), generationId: result.generationId || null };
    });
    const results = await Promise.allSettled(requests);
    const created: DraftVersion[] = [];
    results.forEach((item) => {
      if (item.status === "fulfilled")
        created.push({
          ...item.value,
          label: String(item.value.label),
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
    });
    const failures = results.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason instanceof Error ? item.reason.message : "Falha desconhecida.");
    setVersions((current) => [...created, ...current]);
    if (created[0]) {
      setActiveId(created[0].id);
      setUndoStack([]);
      setRedoStack([]);
    }
    if (failures.length) setError(failures.join(" "));
    setLoading(false); setSelectorOpen(false);
  }

  async function copyActive() {
    if (!active) return;
    await navigator.clipboard.writeText(active.content);
    if (active.generationId) await acceptClinicalAiSections({ generationId: active.generationId, sections: [`documentation:${active.kind}:copied`] });
    toast.success("Rascunho copiado. Revise antes de utilizar.");
  }

  async function discardActive() {
    if (!active) return;
    if (active.generationId) await discardClinicalAiSuggestion(active.generationId);
    setVersions((current) => current.filter((item) => item.id !== active.id));
    setActiveId(null);
    setUndoStack([]);
    setRedoStack([]);
  }

  async function createOfficialDraft() {
    if (!active) return;
    const type = persistedType[active.kind];
    if (!type) return;
    const created = await createClinicalDocument(appointmentId, type);
    if ("error" in created) return toast.error(created.error);
    const saved = await saveClinicalDocument(created.id, active.label, { body: active.content, text: active.content }, [], { generatedByAi: true });
    if ("error" in saved) return toast.error(saved.error);
    if (active.generationId) await acceptClinicalAiSections({ generationId: active.generationId, sections: [`documentation:${active.kind}:draft_created`] });
    router.push(`/documentos/${created.id}`);
  }

  return <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Documentação clínica inteligente</h4><p className="text-xs text-muted-foreground">Gere somente rascunhos editáveis com base no conteúdo registrado.</p></div><Button type="button" size="sm" disabled={!canCreate || loading} onClick={() => setSelectorOpen(true)}><FileText /> Gerar documentação</Button></div>
    {loading && <div role="status" className="space-y-1"><p className="flex items-center gap-2 text-xs"><Loader2 className="size-3 animate-spin" /> Gerando {progress} de {selected.length} documentos...</p><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${selected.length ? (progress / selected.length) * 100 : 0}%` }} /></div></div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {active && <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(150px,0.35fr)_minmax(0,1fr)]"><aside className="space-y-2">{groupedVersions.map((group) => <div key={group.kind}><p className="text-xs font-semibold">{group.label}</p>{group.items.map((item) => <button key={item.id} type="button" className={`mt-1 w-full rounded-md border p-2 text-left text-xs ${active.id === item.id ? "border-primary bg-primary/10" : "bg-background"}`} onClick={() => { setActiveId(item.id); setUndoStack([]); setRedoStack([]); }}>{new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</button>)}</div>)}</aside><section className="min-w-0 space-y-2 rounded-lg border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{active.label} · rascunho</strong><div className="flex gap-1"><Button type="button" size="icon-xs" variant="ghost" aria-label="Desfazer" disabled={!undoStack.length} onClick={undo}><Undo2 /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label="Refazer" disabled={!redoStack.length} onClick={redo}><Redo2 /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label="Negrito" onClick={() => applyFormatting(editorRef.current, active.content, updateActive, "bold")}><Bold /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label="Itálico" onClick={() => applyFormatting(editorRef.current, active.content, updateActive, "italic")}><Italic /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label="Lista" onClick={() => applyFormatting(editorRef.current, active.content, updateActive, "list")}><List /></Button></div></div><textarea ref={editorRef} rows={16} value={active.content} onChange={(event) => updateActive(event.target.value)} className="w-full resize-y rounded-md border p-3 text-sm leading-6" aria-label={`Editor do rascunho ${active.label}`} /><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void copyActive()}><Clipboard /> Copiar</Button><Button type="button" size="sm" variant="outline" disabled={!persistedType[active.kind]} title={persistedType[active.kind] ? "Criar rascunho no módulo oficial" : "Este tipo ainda não possui persistência no banco atual"} onClick={() => void createOfficialDraft()}><CheckSquare /> Criar rascunho oficial</Button><Button type="button" size="sm" variant="outline" disabled title="PDF disponível após revisão e emissão no módulo oficial">Baixar PDF</Button><Button type="button" size="sm" variant="ghost" onClick={() => void discardActive()}><Trash2 /> Cancelar</Button></div><p className="border-t pt-2 text-xs font-medium text-muted-foreground">Documento gerado por IA. Necessita revisão profissional.</p></section></div>}

    <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Gerar documentação</DialogTitle><DialogDescription>Selecione somente os rascunhos necessários. Nenhum documento será emitido ou inserido automaticamente.</DialogDescription></DialogHeader><div className="grid gap-2 sm:grid-cols-2">{documentKinds.map(([kind, label]) => <label key={kind} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={selected.includes(kind)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind))} />{label}</label>)}</div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="button" disabled={!selected.length || loading} onClick={() => void generate()}>{loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Gerar {selected.length} rascunho(s)</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
