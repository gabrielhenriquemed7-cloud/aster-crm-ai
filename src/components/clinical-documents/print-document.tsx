"use client";
/* eslint-disable @next/next/no-img-element -- Plain img is required for reliable Safari printing and PDF output. */

import { Download, ExternalLink, Printer, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { markDocumentPrinted } from "@/app/(dashboard)/documentos/actions";
import { Button } from "@/components/ui/button";
import { clinicalDocumentLabels, type ClinicalDocument } from "@/lib/clinical-documents/types";

function clinicAddress(document: ClinicalDocument) {
  const clinic = document.clinic;
  return [clinic?.address, clinic?.address_number, clinic?.address_complement, clinic?.neighborhood, clinic?.city, clinic?.state, clinic?.zip_code].filter(Boolean).join(", ");
}

function CopyPage({ document, copy, logoRef, onLogoLoad, onLogoError }: { document: ClinicalDocument; copy?: string; logoRef?: React.RefObject<HTMLImageElement | null>; onLogoLoad?: () => void; onLogoError?: () => void }) {
  const clinic = document.clinic;
  const professional = document.professional;
  const settings = document.document_settings ?? {};
  const address = clinicAddress(document);
  const contactPhone = clinic?.phone || clinic?.whatsapp;
  const council = [professional?.council, professional?.council_number].filter(Boolean).join(" ") + (professional?.council_state ? `/${professional.council_state}` : "");
  const specialty = [professional?.specialty, settings.show_rqe !== false && professional?.rqe ? `RQE ${professional.rqe}` : null].filter(Boolean).join(" · ");
  const prescription = document.snapshot_json?.prescription?.presentation;
  const snapshotItems = document.snapshot_json?.prescription?.items;
  return <article className="mx-auto min-h-[277mm] max-w-[210mm] bg-white p-[18mm] text-black print:min-h-screen print:max-w-none print:p-[15mm]">
    <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
      <div className="flex min-w-0 items-start gap-4">{settings.show_logo !== false && clinic?.logo_url && <div className="flex h-16 w-36 shrink-0 items-center justify-start"><img ref={logoRef} src={clinic.logo_url} alt={`Logomarca de ${clinic.name}`} className="max-h-16 max-w-36 object-contain object-left" onLoad={onLogoLoad} onError={onLogoError} /></div>}<div>{clinic?.name && <h1 className="text-xl font-bold">{clinic.name}</h1>}{clinic?.legal_name && clinic.legal_name !== clinic.name && <p className="text-xs">{clinic.legal_name}</p>}</div></div>
      <div className="max-w-64 text-right text-xs">{(settings.header_text || clinic?.legal_name) && <p>{settings.header_text || clinic?.legal_name}</p>}{settings.show_cnpj !== false && clinic?.cnpj && <p>CNPJ {clinic.cnpj}</p>}{settings.show_address !== false && address && <p>{address}</p>}{settings.show_phone !== false && contactPhone && <p>{contactPhone}</p>}{settings.show_email !== false && clinic?.email && <p>{clinic.email}</p>}</div>
    </header>
    <div className="mt-6 text-center"><h2 className="text-xl font-bold uppercase">{document.title}</h2>{copy && <p className="mt-1 font-semibold">{copy}</p>}</div>
    <section className="mt-6 grid grid-cols-2 gap-x-8 border-y py-3 text-sm"><div><p><strong>Paciente:</strong> {document.patient?.social_name || document.patient?.full_name}</p><p><strong>Data de nascimento:</strong> {document.patient?.birth_date ? new Date(`${document.patient.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "Não informada"}</p></div><div className="text-right"><p><strong>Emissão:</strong> {document.issued_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(document.issued_at)) : "Rascunho"}</p><p><strong>Documento nº</strong> {String(document.public_number).padStart(8, "0")}</p></div></section>
    {prescription?.medications?.length ? <div className="mt-8 space-y-7">{prescription.medications.map((item, index) => <section key={`${index}-${item.name}`} className="break-inside-avoid"><p className="text-base font-bold">{index + 1}. {item.name}</p>{item.formAndPackage && <p className="mt-1 text-sm text-neutral-700">{item.formAndPackage}</p>}{item.posology && <p className="mt-3 text-sm">{item.posology}</p>}{item.quantity && <p className="mt-1 text-sm font-medium">{item.quantity}</p>}{item.orientations.length > 0 && <div className="mt-2 text-sm"><p className="font-medium">Orientações:</p><ul className="list-disc pl-5">{item.orientations.map((line) => <li key={line}>{line}</li>)}</ul></div>}</section>)}{(prescription.orientations?.length ?? 0) > 0 && <section className="break-inside-avoid border-t pt-4 text-sm"><h3 className="font-bold">Orientações gerais</h3><ul className="mt-1 list-disc pl-5">{prescription.orientations?.map((line) => <li key={line}>{line}</li>)}</ul></section>}</div> : snapshotItems?.length ? <div className="mt-8 space-y-6">{snapshotItems.map((item, index) => <div key={item.id ?? index}><p className="font-bold">{index + 1}. {item.medication_name} {item.concentration} — {item.pharmaceutical_form}</p><p className="mt-1 text-sm">Via {item.route} · {item.dosage} · {item.frequency} · por {item.duration} · Quantidade: {item.quantity}</p><p className="mt-1 text-sm">{item.instructions}</p></div>)}</div> : <div className="mt-8 space-y-4 text-sm">{Object.entries(document.snapshot_json && "content" in document.snapshot_json ? (document.snapshot_json.content as Record<string, unknown>) : document.content).filter(([key, value]) => value && typeof value !== "boolean" && !(key === "cid" && document.content.hide_cid)).map(([key, value]) => <div key={key}><p className="font-semibold capitalize">{key.replaceAll("_", " ")}</p><p className="whitespace-pre-wrap">{String(value)}</p></div>)}</div>}
    <footer className="mt-20 break-inside-avoid text-center"><div className="mx-auto w-80 border-t border-black pt-2 text-sm">{(professional?.professional_name || professional?.full_name) && <strong>{professional?.professional_name || professional?.full_name}</strong>}{professional?.profession && <p>{professional.profession}</p>}{settings.show_council !== false && council && <p>{council}</p>}{settings.show_specialty !== false && specialty && <p>{specialty}</p>}{(settings.signature_text || settings.physical_signature_space !== false) && <p className="mt-8 text-xs">{settings.signature_text || "Assinatura física e carimbo"}</p>}</div></footer>
    {settings.footer_text && <p className="mt-8 text-center text-xs">{settings.footer_text}</p>}
    {document.status === "cancelled" && <div className="mt-10 border-2 border-black p-3 text-center font-bold">DOCUMENTO CANCELADO — {document.cancellation_reason}</div>}
  </article>;
}

export function PrintDocument({ document }: { document: ClinicalDocument }) {
  const logoRef = useRef<HTMLImageElement>(null);
  const hasLogo = document.document_settings?.show_logo !== false && Boolean(document.clinic?.logo_url);
  const [logoReady, setLogoReady] = useState(!hasLogo);
  const [logoError, setLogoError] = useState(false);
  async function print() {
    const logo = logoRef.current;
    if (logo && !logoError) {
      try { if (!logo.complete) await new Promise<void>((resolve) => { logo.addEventListener("load", () => resolve(), { once: true }); logo.addEventListener("error", () => resolve(), { once: true }); }); await logo.decode?.(); } catch { /* A impressão continua sem interromper o documento. */ }
    }
    await markDocumentPrinted(document.id); window.print();
  }
  const special = document.document_type === "special_prescription";
  return <div><div className="sticky top-0 z-10 border-b bg-background p-3 print:hidden"><div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2"><div className="mr-auto min-w-0"><strong className="block text-sm">Documento clínico oficial</strong><p className="truncate text-xs text-muted-foreground">{document.snapshot_json?.is_legacy ? "Representação histórica legada congelada" : logoError ? "A logomarca não carregou; o documento pode ser impresso sem ela." : !logoReady ? "Carregando logomarca…" : `${clinicalDocumentLabels[document.document_type]} · snapshot imutável`}</p></div><Button variant="outline" onClick={print} disabled={hasLogo && !logoReady && !logoError}><Printer />Imprimir</Button>{document.pdf_status === "available" ? <Button render={<a href={`/api/clinical-documents/${document.id}/pdf`} />} nativeButton={false}><Download />Baixar PDF</Button> : <Button disabled title="O PDF original ainda não foi persistido"><Download />PDF pendente</Button>}<Button variant="outline" render={<Link href={`/documentos/${document.id}`} />} nativeButton={false}><ExternalLink />Central de Documentos</Button><Button variant="ghost" onClick={() => window.close()}><X />Fechar</Button></div></div>{document.snapshot_json?.legacy?.warning && <p className="mx-auto mt-4 max-w-[210mm] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 print:hidden">{document.snapshot_json.legacy.warning}</p>}<CopyPage document={document} copy={special ? "1ª via — Farmácia" : undefined} logoRef={logoRef} onLogoLoad={() => setLogoReady(true)} onLogoError={() => { setLogoError(true); console.error("ASTER_DOCUMENT_LOGO_ERROR", { logoPath: document.clinic?.logo_path ?? null, hasSignedUrl: Boolean(document.clinic?.logo_url), message: "Falha ao carregar a logomarca no navegador.", code: "IMAGE_LOAD_ERROR" }); }} />{special && <div className="break-before-page"><CopyPage document={document} copy="2ª via — Paciente" /></div>}</div>;
}
