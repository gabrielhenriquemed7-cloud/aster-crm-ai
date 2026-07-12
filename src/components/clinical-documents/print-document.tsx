"use client";

import { Printer } from "lucide-react";

import { markDocumentPrinted } from "@/app/(dashboard)/documentos/actions";
import { Button } from "@/components/ui/button";
import { clinicalDocumentLabels, type ClinicalDocument } from "@/lib/clinical-documents/types";

function clinicAddress(document: ClinicalDocument) {
  const clinic = document.clinic;
  return [clinic?.address, clinic?.address_number, clinic?.address_complement, clinic?.neighborhood, clinic?.city, clinic?.state, clinic?.zip_code].filter(Boolean).join(", ");
}

function CopyPage({ document, copy }: { document: ClinicalDocument; copy?: string }) {
  const clinic = document.clinic;
  const professional = document.professional;
  return <article className="mx-auto min-h-[277mm] max-w-[210mm] bg-white p-[18mm] text-black print:min-h-screen print:max-w-none print:p-[15mm]">
    <header className="flex items-start justify-between border-b-2 border-black pb-4">
      {clinic?.logo_url ? <div role="img" aria-label={`Logomarca de ${clinic.name}`} className="h-16 w-36 bg-contain bg-left bg-no-repeat" style={{ backgroundImage: `url(${clinic.logo_url})` }} /> : <div><h1 className="text-xl font-bold">{clinic?.name}</h1><p className="text-xs">{clinic?.legal_name}</p></div>}
      <div className="max-w-64 text-right text-xs"><p>{clinic?.legal_name}</p><p>{clinic?.cnpj && `CNPJ ${clinic.cnpj}`}</p><p>{clinicAddress(document)}</p><p>{clinic?.phone || clinic?.whatsapp} {clinic?.email}</p></div>
    </header>
    <div className="mt-6 text-center"><h2 className="text-xl font-bold uppercase">{document.title}</h2>{copy && <p className="mt-1 font-semibold">{copy}</p>}</div>
    <section className="mt-6 border-y py-3 text-sm"><p><strong>Paciente:</strong> {document.patient?.social_name || document.patient?.full_name}</p><p><strong>Data de nascimento:</strong> {document.patient?.birth_date ? new Date(`${document.patient.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "Não informada"}</p><p><strong>Emissão:</strong> {document.issued_at ? new Date(document.issued_at).toLocaleString("pt-BR") : "Rascunho"} · <strong>Documento nº</strong> {String(document.public_number).padStart(8, "0")}</p></section>
    {document.items?.length ? <div className="mt-8 space-y-6">{document.items.map((item, index) => <div key={index}><p className="font-bold">{index + 1}. {item.medication_name} {item.concentration} — {item.pharmaceutical_form}</p><p className="mt-1 text-sm">Via {item.route} · {item.dosage} · {item.frequency} · por {item.duration} · Quantidade: {item.quantity}</p><p className="mt-1 text-sm">{item.instructions}</p></div>)}</div> : <div className="mt-8 space-y-4 text-sm">{Object.entries(document.content).filter(([key, value]) => value && typeof value !== "boolean" && !(key === "cid" && document.content.hide_cid)).map(([key, value]) => <div key={key}><p className="font-semibold capitalize">{key.replaceAll("_", " ")}</p><p className="whitespace-pre-wrap">{String(value)}</p></div>)}</div>}
    <footer className="mt-20 text-center"><div className="mx-auto w-72 border-t border-black pt-2 text-sm"><strong>{professional?.professional_name || professional?.full_name}</strong><p>{professional?.profession || "Médico"}</p><p>{professional?.council} {professional?.council_number}{professional?.council_state ? `/${professional.council_state}` : ""}</p><p>{professional?.specialty}{professional?.rqe ? ` · RQE ${professional.rqe}` : ""}</p><p className="mt-8 text-xs">Assinatura física e carimbo</p></div></footer>
    {document.status === "cancelled" && <div className="mt-10 border-2 border-black p-3 text-center font-bold">DOCUMENTO CANCELADO — {document.cancellation_reason}</div>}
  </article>;
}

export function PrintDocument({ document }: { document: ClinicalDocument }) {
  async function print() { await markDocumentPrinted(document.id); window.print(); }
  const special = document.document_type === "special_prescription";
  return <div><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background p-4 print:hidden"><p className="text-sm">{clinicalDocumentLabels[document.document_type]} · use “Salvar como PDF” na janela de impressão.</p><Button onClick={print}><Printer />Imprimir / gerar PDF</Button></div><CopyPage document={document} copy={special ? "1ª via — Farmácia" : undefined} />{special && <div className="break-before-page"><CopyPage document={document} copy="2ª via — Paciente" /></div>}</div>;
}
