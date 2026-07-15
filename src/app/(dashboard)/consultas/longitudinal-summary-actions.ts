"use server";

import { z } from "zod";

import {
  longitudinalSummaryJsonSchema,
  longitudinalSummarySchema,
  type LongitudinalSource,
  type StoredLongitudinalSummary,
} from "@/lib/ai/longitudinal-schema";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ patientId: z.string().uuid() });
const SCHEMA_VERSION = "1.0";
const BATCH_SIZE = 8;
const MAX_RECORDS = 40;
const MAX_CONTEXT_CHARS = 100_000;

type ClinicalSourceRecord = {
  sourceId: string;
  date: string;
  professional: string;
  recordType: string;
  url: string;
  clinicalData: Record<string, string | null>;
};

function responseText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (
    response.output_text ??
    response.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text
  );
}

function safeExcerpt(record: ClinicalSourceRecord) {
  const value = Object.values(record.clinicalData)
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  return value.slice(0, 240);
}

async function context() {
  const supabase = await createClient();
  if (!supabase) return { error: "LONGITUDINAL_ERROR" } as const;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "LONGITUDINAL_PERMISSION_DENIED" } as const;
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id)
    return { error: "LONGITUDINAL_PERMISSION_DENIED" } as const;
  return {
    supabase,
    userId: auth.user.id,
    clinicId: profile.active_clinic_id,
    error: null,
  } as const;
}

async function callOpenAi(
  key: string,
  model: string,
  input: unknown,
  consolidation: boolean,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: `Você gera um resumo clínico longitudinal rastreável a partir exclusivamente de registros confirmados no prontuário.
Não invente, não conclua resolução sem registro explícito, não trate hipótese como diagnóstico e não considere atual um medicamento apenas porque foi usado no passado.
Destaque contradições, incertezas e ausência de dados; nunca afirme ausência de alergia ou doença por falta de registro.
Cada item importante deve usar somente sourceIds existentes na entrada. Datas devem ser preservadas. A visão geral deve ter no máximo seis linhas.
Separe diagnósticos confirmados de hipóteses não confirmadas. Exames sem resultado não são resultados. Sugestões antigas de IA não fazem parte da entrada.
${consolidation ? "Consolide os resumos de lotes, remova duplicações e preserve todas as fontes relevantes." : "Resuma o lote cronologicamente."}
Responda apenas no schema JSON solicitado.`,
      input: JSON.stringify(input),
      max_output_tokens: 6000,
      text: {
        format: {
          type: "json_schema",
          name: "longitudinal_clinical_summary",
          strict: true,
          schema: longitudinalSummaryJsonSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
  const payload = (await response.json()) as {
    output_text?: string;
    usage?: { total_tokens?: number };
  };
  const text = responseText(payload);
  if (!text) throw new Error("LONGITUDINAL_INVALID_RESPONSE");
  const parsed = longitudinalSummarySchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("LONGITUDINAL_INVALID_RESPONSE");
  return { summary: parsed.data, tokens: payload.usage?.total_tokens ?? 0 };
}

export async function generateLongitudinalSummary(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { error: "LONGITUDINAL_PERMISSION_DENIED" } as const;
  const startedAt = Date.now();
  const c = await context();
  if (c.error) return { error: c.error } as const;
  const { data: patient } = await c.supabase
    .from("patients")
    .select("id")
    .eq("id", parsed.data.patientId)
    .eq("clinic_id", c.clinicId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!patient) return { error: "LONGITUDINAL_PERMISSION_DENIED" } as const;

  const [{ data: records }, { data: documents }] = await Promise.all([
    c.supabase
      .from("medical_records")
      .select(
        "id,appointment_id,professional_id,chief_complaint,hpi,pmh,medications,allergies,family_history,social_history,physical_exam,assessment,cid10,plan,prescription,exam_requests,return_guidance,vital_signs,guidance,status,created_at,updated_at",
      )
      .eq("clinic_id", c.clinicId)
      .eq("patient_id", patient.id)
      .is("deleted_at", null)
      .in("status", ["draft", "finalized", "amended"])
      .order("created_at", { ascending: true }),
    c.supabase
      .from("clinical_documents")
      .select(
        "id,appointment_id,professional_id,title,document_type,status,issued_at,created_at",
      )
      .eq("clinic_id", c.clinicId)
      .eq("patient_id", patient.id)
      .eq("status", "issued")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);
  if (!(records ?? []).length)
    return { error: "LONGITUDINAL_NO_HISTORY" } as const;
  const appointmentIds = [
    ...new Set([
      ...(records ?? []).map((item) => item.appointment_id),
      ...(documents ?? []).map((item) => item.appointment_id),
    ]),
  ];
  const professionalIds = [
    ...new Set([
      ...(records ?? []).map((item) => item.professional_id),
      ...(documents ?? []).map((item) => item.professional_id),
    ]),
  ];
  const [{ data: appointments }, { data: professionals }] = await Promise.all([
    c.supabase
      .from("appointments")
      .select("id,appointment_date,start_time,title")
      .eq("clinic_id", c.clinicId)
      .in("id", appointmentIds),
    c.supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", professionalIds),
  ]);
  const appointmentMap = new Map(
    (appointments ?? []).map((item) => [item.id, item]),
  );
  const professionalMap = new Map(
    (professionals ?? []).map((item) => [
      item.id,
      item.full_name || "Profissional",
    ]),
  );
  const clinicalRecords: ClinicalSourceRecord[] = (records ?? []).map(
    (record) => {
      const appointment = appointmentMap.get(record.appointment_id);
      return {
        sourceId: `record:${record.id}`,
        date: appointment?.appointment_date || record.created_at,
        professional:
          professionalMap.get(record.professional_id) || "Profissional",
        recordType: "prontuário",
        url: `/consultas/${record.appointment_id}/prontuario`,
        clinicalData: {
          motivo: record.chief_complaint,
          hda: record.hpi,
          antecedentes: record.pmh,
          alergias: record.allergies,
          medicamentos: record.medications,
          história_familiar: record.family_history,
          hábitos: record.social_history,
          sinais_vitais: record.vital_signs,
          exame_físico: record.physical_exam,
          avaliação_registrada: record.assessment,
          cid_registrado: record.cid10,
          conduta: record.plan,
          prescrição: record.prescription,
          exames_solicitados: record.exam_requests,
          orientações: record.guidance,
          retorno: record.return_guidance,
        },
      };
    },
  );
  const documentRecords: ClinicalSourceRecord[] = (documents ?? []).map(
    (document) => ({
      sourceId: `document:${document.id}`,
      date: document.issued_at || document.created_at,
      professional:
        professionalMap.get(document.professional_id) || "Profissional",
      recordType: `documento ${document.document_type}`,
      url: `/documentos/${document.id}`,
      clinicalData: { documento_emitido: document.title },
    }),
  );
  const allRecords = [...clinicalRecords, ...documentRecords].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const partiallyProcessed = allRecords.length > MAX_RECORDS;
  const selected = allRecords.slice(-MAX_RECORDS);
  const serializedLength = JSON.stringify(selected).length;
  if (serializedLength > MAX_CONTEXT_CHARS)
    return { error: "LONGITUDINAL_CONTEXT_TOO_LARGE" } as const;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "LONGITUDINAL_ERROR" } as const;
  const model = process.env.OPENAI_CLINICAL_MODEL || "gpt-4.1-mini";
  let totalTokens = 0;
  try {
    const batches = Array.from(
      { length: Math.ceil(selected.length / BATCH_SIZE) },
      (_, index) =>
        selected.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
    );
    const intermediate = [];
    for (const batch of batches) {
      const result = await callOpenAi(key, model, { records: batch }, false);
      intermediate.push(result.summary);
      totalTokens += result.tokens;
    }
    const consolidated =
      intermediate.length === 1
        ? intermediate[0]
        : await callOpenAi(key, model, { batchSummaries: intermediate }, true);
    const summary =
      "summary" in consolidated ? consolidated.summary : consolidated;
    if ("tokens" in consolidated) totalTokens += consolidated.tokens;
    summary.partiallyProcessed = partiallyProcessed;
    const sources: LongitudinalSource[] = selected.map((record) => ({
      id: record.sourceId,
      date: record.date,
      recordType: record.recordType,
      professional: record.professional,
      excerpt: safeExcerpt(record),
      url: record.url,
    }));
    const lastRecordAt = selected.at(-1)?.date ?? null;
    const status = partiallyProcessed ? "partial" : "ready";
    const saved = await c.supabase
      .from("longitudinal_clinical_summaries")
      .upsert(
        {
          clinic_id: c.clinicId,
          patient_id: patient.id,
          generated_by: c.userId,
          generated_at: new Date().toISOString(),
          last_record_at: lastRecordAt,
          records_count: selected.length,
          model,
          schema_version: SCHEMA_VERSION,
          summary,
          sources,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id,patient_id" },
      )
      .select(
        "id,patient_id,generated_at,last_record_at,records_count,model,schema_version,summary,sources,status",
      )
      .single();
    if (saved.error || !saved.data) throw new Error("LONGITUDINAL_SAVE_ERROR");
    console.info("ASTER_LONGITUDINAL_SUMMARY", {
      clinicId: c.clinicId,
      patientId: patient.id,
      recordsCount: selected.length,
      dateFrom: selected[0]?.date ?? null,
      dateTo: lastRecordAt,
      model,
      tokens: totalTokens,
      durationMs: Date.now() - startedAt,
      code: "SUCCESS",
    });
    return { summary: saved.data as StoredLongitudinalSummary };
  } catch (error) {
    const code =
      error instanceof Error && error.message.startsWith("LONGITUDINAL_")
        ? error.message
        : "LONGITUDINAL_ERROR";
    console.error("ASTER_LONGITUDINAL_SUMMARY_ERROR", {
      clinicId: c.clinicId,
      patientId: patient.id,
      recordsCount: selected.length,
      dateFrom: selected[0]?.date ?? null,
      dateTo: selected.at(-1)?.date ?? null,
      model,
      tokens: totalTokens,
      durationMs: Date.now() - startedAt,
      code,
    });
    return { error: code } as const;
  }
}
