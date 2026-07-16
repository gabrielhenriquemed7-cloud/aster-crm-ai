"use client";
import { FilePlus2, Files, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createClinicalDocument } from "@/app/(dashboard)/documentos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  clinicalDocumentLabels,
  type ClinicalDocumentType,
} from "@/lib/clinical-documents/types";
const types: ClinicalDocumentType[] = [
  "prescription",
  "exam_request",
  "medical_certificate",
  "attendance_declaration",
  "referral",
  "patient_guidance",
];
export function RecordDocuments({
  appointmentId,
  canCreate,
  documents,
}: {
  appointmentId: string;
  canCreate: boolean;
  documents: Array<{
    id: string;
    title: string;
    status: string;
    issued_at: string | null;
    created_at: string;
  }>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<ClinicalDocumentType | null>(null);
  async function create(type: ClinicalDocumentType) {
    setLoading(type);
    const result = await createClinicalDocument(appointmentId, type);
    setLoading(null);
    if ("error" in result) return toast.error(result.error);
    router.push(`/documentos/${result.id}`);
  }
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Files className="text-primary" />
          Documentos
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          render={<Link href={`/consultas/${appointmentId}/documentos`} />}
        >
          Ver todos
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length ? (
          <div className="space-y-2">
            {documents.map((document) => (
              <Link
                key={document.id}
                href={`/documentos/${document.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-muted/30"
              >
                <span>{document.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {document.issued_at
                    ? new Date(document.issued_at).toLocaleDateString("pt-BR")
                    : new Date(document.created_at).toLocaleDateString("pt-BR")}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum documento gerado.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {types.map((type) => (
            <Button
              type="button"
              size="sm"
              variant="outline"
              key={type}
              disabled={!canCreate || Boolean(loading)}
              onClick={() => create(type)}
            >
              {loading === type ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FilePlus2 />
              )}
              {clinicalDocumentLabels[type]}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
