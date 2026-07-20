import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const SOURCE_URL =
  process.env.CMED_PRESENTATIONS_XLSX_URL ??
  "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos/xls_conformidade_site_20260710_124824323.xlsx/@@download/file";
const BATCH_SIZE = 300;

const formCodes = [
  ["COM REV", "Comprimido revestido"],
  ["COM SUBL", "Comprimido sublingual"],
  ["COM MAST", "Comprimido mastigável"],
  ["COM", "Comprimido"],
  ["CAP DURA", "Cápsula dura"],
  ["CAP MOLE", "Cápsula mole"],
  ["CAP", "Cápsula"],
  ["PO LIOF SOL INJ", "Pó liofilizado para solução injetável"],
  ["PO SOL INJ", "Pó para solução injetável"],
  ["SOL INJ", "Solução injetável"],
  ["SUSP INJ", "Suspensão injetável"],
  ["PO SUS OR", "Pó para suspensão oral"],
  ["SOL OR", "Solução oral"],
  ["SUSP OR", "Suspensão oral"],
  ["XPE", "Xarope"],
  ["GOT", "Gotas"],
  ["CREM DERM", "Creme dermatológico"],
  ["POM DERM", "Pomada dermatológica"],
  ["SOL OFT", "Solução oftálmica"],
  ["SOL NAS", "Solução nasal"],
  ["AER", "Aerossol"],
  ["SUP", "Supositório"],
  ["DRG", "Drágea"],
];

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function text(value) {
  const result = String(value ?? "").trim();
  return result && result !== "-" ? result : null;
}

export function parsePresentation(raw) {
  const normalized = raw.toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim();
  const concentration =
    normalized.match(
      /\b\d+(?:[.,]\d+)?(?:\s*(?:A|\/)\s*\d+(?:[.,]\d+)?)?\s*(?:MG\/ML|MG\/G|MCG\/ML|MCG|MG|G\/ML|G|UI\/ML|UI)\b/,
    )?.[0] ?? null;
  const form =
    formCodes.find(([code]) =>
      new RegExp(`(?:^|\\s)${code.replaceAll(" ", "\\s+")}(?:\\s|$)`).test(
        normalized,
      ),
    )?.[1] ?? null;
  const packageDescription =
    normalized.match(/\b(?:CT|CX|FR|ENV|BL|BG|AMP)\b.*$/)?.[0] ?? null;
  return { concentration, pharmaceuticalForm: form, packageDescription };
}

async function main() {
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  console.log(`Baixando apresentações oficiais: ${SOURCE_URL}`);
  const bytes = execFileSync(
    "curl",
    ["-L", "--fail", "--silent", "--show-error", "--max-time", "180", SOURCE_URL],
    { maxBuffer: 25 * 1024 * 1024 },
  );
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const existing = await supabase
    .from("medication_presentation_imports")
    .select("id,status")
    .eq("checksum_sha256", checksum)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "completed") {
    console.log("Esta versão da CMED já foi importada.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(43).values.slice(1).map((value) => text(value));
  const column = (name) => headers.indexOf(name) + 1;
  const required = ["SUBSTÂNCIA", "LABORATÓRIO", "CÓDIGO GGREM", "REGISTRO", "PRODUTO", "APRESENTAÇÃO"];
  for (const name of required)
    if (column(name) < 1) throw new Error(`Coluna CMED ausente: ${name}`);

  const importResult = await supabase
    .from("medication_presentation_imports")
    .upsert(
      {
        source: "ANVISA_CMED",
        source_url: SOURCE_URL,
        source_published_at: "2026-07-10T13:30:00-03:00",
        checksum_sha256: checksum,
        status: "processing",
        imported_rows: 0,
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
      },
      { onConflict: "checksum_sha256" },
    )
    .select("id")
    .single();
  if (importResult.error) throw importResult.error;
  const importId = importResult.data.id;

  const rows = [];
  for (let rowNumber = 44; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const ggremCode = text(row.getCell(column("CÓDIGO GGREM")).value);
    const presentation = text(row.getCell(column("APRESENTAÇÃO")).value);
    const productName = text(row.getCell(column("PRODUTO")).value);
    const substance = text(row.getCell(column("SUBSTÂNCIA")).value);
    const manufacturer = text(row.getCell(column("LABORATÓRIO")).value);
    if (!ggremCode || !presentation || !productName || !substance || !manufacturer)
      continue;
    const registrationNumber = text(row.getCell(column("REGISTRO")).value);
    const parsed = parsePresentation(presentation);
    rows.push({
      source_import_id: importId,
      ggrem_code: ggremCode,
      registration_number: registrationNumber,
      product_registration_number: registrationNumber?.slice(0, 9) ?? null,
      ean: text(row.getCell(column("EAN 1")).value),
      substance,
      product_name: productName,
      manufacturer,
      presentation,
      concentration: parsed.concentration,
      pharmaceutical_form: parsed.pharmaceuticalForm,
      package_description: parsed.packageDescription,
      therapeutic_class: text(row.getCell(column("CLASSE TERAPÊUTICA")).value),
      product_type: text(row.getCell(column("TIPO DE PRODUTO (STATUS DO PRODUTO)")).value),
      price_regime: text(row.getCell(column("REGIME DE PREÇO")).value),
    });
  }
  const uniqueRows = [...new Map(rows.map((row) => [row.ggrem_code, row])).values()];

  try {
    for (let index = 0; index < uniqueRows.length; index += BATCH_SIZE) {
      const batch = uniqueRows.slice(index, index + BATCH_SIZE);
      const result = await supabase
        .from("medication_presentations")
        .upsert(batch, { onConflict: "source_import_id,ggrem_code" });
      if (result.error) throw result.error;
      console.log(`Importadas ${Math.min(index + batch.length, uniqueRows.length)}/${uniqueRows.length}`);
    }
    const completed = await supabase
      .from("medication_presentation_imports")
      .update({
        status: "completed",
        imported_rows: uniqueRows.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId);
    if (completed.error) throw completed.error;
    console.log(`Importação CMED concluída: ${uniqueRows.length} apresentações.`);
  } catch (error) {
    await supabase
      .from("medication_presentation_imports")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId);
    throw error;
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error("Falha ao importar apresentações CMED:", error);
    process.exitCode = 1;
  });
}
