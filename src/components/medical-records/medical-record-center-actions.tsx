"use client";

import {
  ArrowLeft,
  Download,
  FileDown,
  Loader2,
  LockKeyhole,
  Pencil,
  Printer,
  Share2,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useMedicalRecordCenter } from "@/hooks/use-medical-record-center";

export function MedicalRecordCenterActions({
  appointmentId,
  canEdit,
}: {
  appointmentId: string;
  canEdit: boolean;
}) {
  const { downloadPdf, downloading } = useMedicalRecordCenter(appointmentId);
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href={`/consultas/${appointmentId}/prontuario`} />}
      >
        <ArrowLeft /> Voltar
      </Button>
      {canEdit ? (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/consultas/${appointmentId}/prontuario`} />}
        >
          <Pencil /> Editar
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <Pencil /> Editar
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer /> Imprimir
      </Button>
      <Button
        size="sm"
        onClick={() => void downloadPdf()}
        disabled={downloading}
      >
        {downloading ? <Loader2 className="animate-spin" /> : <FileDown />}
        Gerar PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void downloadPdf()}
        disabled={downloading}
      >
        <Download /> Baixar PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Compartilhamento seguro será habilitado em uma etapa futura."
      >
        <Share2 /> Compartilhar
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Assinatura digital será habilitada em uma etapa futura."
      >
        <LockKeyhole /> Assinar
      </Button>
    </div>
  );
}
