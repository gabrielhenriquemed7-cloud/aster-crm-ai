import "server-only";

import type { OfficialClinicalDocumentSnapshot } from "@/lib/clinical-documents/types";

function pdfEscape(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrap(value: string, width = 88) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textLines(snapshot: OfficialClinicalDocumentSnapshot) {
  const lines = [
    snapshot.clinic?.name || "Clinica",
    snapshot.clinic?.address_text || "",
    "",
    snapshot.title,
    `Documento no ${String(snapshot.public_number).padStart(8, "0")} - versao ${snapshot.document_version}`,
    `Paciente: ${snapshot.patient?.name || "Paciente"}`,
    snapshot.patient?.birth_date
      ? `Data de nascimento: ${snapshot.patient.birth_date}`
      : "",
    `Emitido em: ${snapshot.issued_at || ""}`,
    "",
  ];
  const presentation = snapshot.prescription?.presentation;
  presentation?.medications?.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`);
    if (item.formAndPackage) lines.push(item.formAndPackage);
    if (item.posology) lines.push(item.posology);
    if (item.quantity) lines.push(item.quantity);
    item.orientations.forEach((orientation) =>
      lines.push(`Orientacao: ${orientation}`),
    );
    lines.push("");
  });
  presentation?.orientations?.forEach((line) =>
    lines.push(`Orientacao geral: ${line}`),
  );
  lines.push(
    "",
    snapshot.professional?.name || "Profissional",
    snapshot.professional?.registration_text || "",
    snapshot.professional?.specialty || "",
  );
  return lines.flatMap((line) => (line ? wrap(line) : [""]));
}

export function generateOfficialClinicalDocumentPdf(
  snapshot: OfficialClinicalDocumentSnapshot,
) {
  const content = [
    "BT",
    "/F1 10 Tf",
    "48 800 Td",
    ...textLines(snapshot).flatMap((line, index) => [
      index === 0 ? "" : "0 -14 Td",
      `(${pdfEscape(line)}) Tj`,
    ]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
