import { NextResponse } from "next/server";

import { MedicalRecordDocumentFactory } from "@/lib/medical-record-center/document-factory";
import { generateMedicalRecordPdf } from "@/lib/medical-record-center/pdf-generator";
import { getMedicalRecordCenterData } from "@/lib/medical-record-center/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getMedicalRecordCenterData(id);
  if (result.error || !result.data)
    return NextResponse.json(
      { error: result.error || "Prontuário não encontrado." },
      { status: 404 },
    );
  const document = MedicalRecordDocumentFactory.create(
    "complete_record",
    result.data,
  );
  const pdf = generateMedicalRecordPdf(document.data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prontuario-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
