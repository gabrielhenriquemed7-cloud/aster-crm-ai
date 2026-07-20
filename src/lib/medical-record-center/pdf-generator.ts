import { scoreDefinitions } from "@/lib/clinical-scores/engine";
import type { MedicalRecordCenterData } from "@/lib/medical-record-center/types";

type PdfLine = { text: string; heading?: boolean };

function clean(value?: string | null) {
  return value?.trim() || "Não informado";
}

function wrap(text: string, width = 88) {
  const result: string[] = [];
  text.split(/\n+/).forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/);
    let line = "";
    words.forEach((word) => {
      if (`${line} ${word}`.trim().length > width) {
        if (line) result.push(line);
        line = word;
      } else line = `${line} ${word}`.trim();
    });
    if (line) result.push(line);
  });
  return result.length ? result : ["Não informado"];
}

function field(label: string, value?: string | null): PdfLine[] {
  return wrap(`${label}: ${clean(value)}`).map((text) => ({ text }));
}

function recordLines(data: MedicalRecordCenterData): PdfLine[] {
  const { appointment, record, professional } = data;
  const patient = appointment.patient;
  const section = (title: string): PdfLine => ({ text: title, heading: true });
  return [
    section("IDENTIFICAÇÃO"),
    ...field("Paciente", patient?.social_name || patient?.full_name),
    ...field("Sexo", patient?.gender),
    ...field("CPF", patient?.cpf),
    ...field("Telefone", patient?.phone),
    ...field("Convênio", patient?.insurance),
    ...field("Número do prontuário", record?.id),
    ...field("Profissional", professional.name),
    ...field(
      "Conselho",
      [
        professional.council,
        professional.councilNumber,
        professional.councilState,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    ...field("Especialidade", professional.specialty),
    ...field("Data", appointment.appointment_date),
    ...field("Hora", appointment.start_time.slice(0, 5)),
    section("ANAMNESE"),
    ...field("Queixa Principal", record?.chief_complaint),
    ...field("História da Doença Atual", record?.hpi),
    ...field("Antecedentes", record?.pmh),
    ...field("Medicações", record?.medications),
    ...field("Alergias", record?.allergies),
    ...field("Hábitos", record?.social_history),
    section("SCORES CLÍNICOS"),
    ...(data.scores.length
      ? data.scores.flatMap((score) => {
          const definition = scoreDefinitions.find(
            (item) => item.id === score.score,
          );
          return field(
            definition?.name || score.score,
            `${score.result} — ${definition?.interpret(score.result) || "Resultado registrado"} — ${new Date(score.calculated_at).toLocaleString("pt-BR")}`,
          );
        })
      : [{ text: "Nenhum score registrado." }]),
    section("EXAME FÍSICO"),
    ...field("Sinais Vitais", record?.vital_signs),
    ...field("Exame consolidado", record?.physical_exam),
    section("HIPÓTESES"),
    ...field("Hipóteses diagnósticas", record?.assessment),
    ...(record?.assessment?.includes("[PRINCIPAL]")
      ? []
      : field("CID", record?.cid10)),
    section("CONDUTA"),
    ...field("Plano e Conduta", record?.plan),
    ...field("Solicitação de Exames", record?.exam_requests),
    ...field("Retorno", record?.return_guidance),
    ...field("Orientações", record?.guidance),
    ...field("Atestados", record?.certificate),
    section("PRESCRIÇÃO MÉDICA"),
    ...field("Prescrição vinculada", record?.prescription),
  ];
}

function pdfEscape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

export function generateMedicalRecordPdf(data: MedicalRecordCenterData) {
  const lines = recordLines(data);
  const pages: PdfLine[][] = [];
  for (let index = 0; index < lines.length; index += 42)
    pages.push(lines.slice(index, index + 42));

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );
  const pageIds: number[] = [];

  pages.forEach((pageLines, pageIndex) => {
    const content = [
      "BT",
      `/F2 14 Tf 50 798 Td (${pdfEscape(data.clinic.name)}) Tj`,
      `/F1 8 Tf 0 -14 Td (PRONTUÁRIO CLÍNICO — ${pdfEscape(data.appointment.patient?.full_name || "Paciente")}) Tj`,
      "ET",
      "0.75 w 50 770 m 545 770 l S",
      ...pageLines.flatMap((line, index) => {
        const y = 750 - index * 16;
        return [
          "BT",
          `/${line.heading ? "F2" : "F1"} ${line.heading ? 10 : 8.5} Tf 50 ${y} Td (${pdfEscape(line.text)}) Tj`,
          "ET",
        ];
      }),
      "0.5 w 50 54 m 545 54 l S",
      "BT",
      `/F1 7 Tf 50 40 Td (${pdfEscape(data.professional.name)} — ${pdfEscape(data.professional.specialty || "Especialidade não informada")}) Tj`,
      `/F1 7 Tf 470 40 Td (Página ${pageIndex + 1}/${pages.length}) Tj`,
      "ET",
    ].join("\n");
    const contentId = add(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
