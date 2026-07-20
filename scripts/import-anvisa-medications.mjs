import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

const SOURCE = "ANVISA_DADOS_ABERTOS";
const SOURCE_URL =
  process.env.ANVISA_MEDICATION_CSV_URL ??
  "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv";
const BATCH_SIZE = 500;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sourceKey(row) {
  const stableValue = [
    clean(row.NUMERO_REGISTRO_PRODUTO),
    clean(row.NUMERO_PROCESSO),
    clean(row.NOME_PRODUTO),
    clean(row.EMPRESA_DETENTORA_REGISTRO),
  ]
    .filter(Boolean)
    .join("|");
  return createHash("sha256").update(stableValue).digest("hex");
}

function catalogRow(row, importId) {
  return {
    source_key: sourceKey(row),
    source: SOURCE,
    product_type: clean(row.TIPO_PRODUTO) ?? "MEDICAMENTO",
    product_name: clean(row.NOME_PRODUTO),
    active_ingredient: clean(row.PRINCIPIO_ATIVO),
    therapeutic_class: clean(row.CLASSE_TERAPEUTICA),
    regulatory_category: clean(row.CATEGORIA_REGULATORIA),
    registration_number: clean(row.NUMERO_REGISTRO_PRODUTO),
    process_number: clean(row.NUMERO_PROCESSO),
    registration_holder: clean(row.EMPRESA_DETENTORA_REGISTRO),
    registration_status: clean(row.SITUACAO_REGISTRO) ?? "Não informado",
    registration_expires: clean(row.DATA_VENCIMENTO_REGISTRO),
    source_import_id: importId,
    source_payload: {
      process_finalized_at: clean(row.DATA_FINALIZACAO_PROCESSO),
    },
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.log(`Baixando catálogo oficial: ${SOURCE_URL}`);
  const bytes = execFileSync(
    "curl",
    ["-L", "--fail", "--silent", "--show-error", "--max-time", "120", SOURCE_URL],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const decoded = new TextDecoder("windows-1252").decode(bytes);
  const records = parse(decoded, {
    columns: true,
    delimiter: ";",
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  const existing = await supabase
    .from("medication_catalog_imports")
    .select("id,status")
    .eq("checksum_sha256", checksum)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "completed") {
    console.log("Este arquivo já foi importado. Nenhuma alteração necessária.");
    return;
  }

  const importRecord = await supabase
    .from("medication_catalog_imports")
    .upsert(
      {
        source: SOURCE,
        source_url: SOURCE_URL,
        source_updated_at: new Date().toISOString(),
        checksum_sha256: checksum,
        status: "processing",
        imported_rows: 0,
        active_rows: 0,
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      },
      { onConflict: "checksum_sha256" },
    )
    .select("id")
    .single();
  if (importRecord.error) throw importRecord.error;

  const importId = importRecord.data.id;
  const parsedRows = records
    .filter((row) => clean(row.NOME_PRODUTO))
    .map((row) => catalogRow(row, importId));
  const validRows = [
    ...new Map(parsedRows.map((row) => [row.source_key, row])).values(),
  ];

  try {
    for (let index = 0; index < validRows.length; index += BATCH_SIZE) {
      const batch = validRows.slice(index, index + BATCH_SIZE);
      const result = await supabase
        .from("medication_catalog")
        .upsert(batch, { onConflict: "source_import_id,source_key" });
      if (result.error) throw result.error;
      console.log(
        `Importados ${Math.min(index + batch.length, validRows.length)}/${validRows.length}`,
      );
    }

    const activeRows = validRows.filter(
      (row) => row.registration_status === "Ativo",
    ).length;
    const completed = await supabase
      .from("medication_catalog_imports")
      .update({
        status: "completed",
        imported_rows: validRows.length,
        active_rows: activeRows,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId);
    if (completed.error) throw completed.error;
    console.log(
      `Importação concluída: ${validRows.length} registros, ${activeRows} ativos.`,
    );
  } catch (error) {
    await supabase
      .from("medication_catalog_imports")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId);
    throw error;
  }
}

main().catch((error) => {
  console.error("Falha ao importar catálogo da Anvisa:", error);
  process.exitCode = 1;
});
