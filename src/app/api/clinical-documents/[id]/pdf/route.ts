import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) {
    return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Serviço indisponível." }, { status: 503 });
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const { data: document, error } = await supabase
    .from("clinical_documents")
    .select("pdf_storage_path,pdf_status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  if (document.pdf_status !== "available" || !document.pdf_storage_path) {
    return NextResponse.json(
      { error: "O PDF original ainda não foi persistido." },
      { status: 409 },
    );
  }

  const signed = await supabase.storage
    .from("clinical-documents")
    .createSignedUrl(document.pdf_storage_path, 60, { download: true });
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json(
      { error: "Não foi possível acessar o PDF original." },
      { status: 502 },
    );
  }
  const audit = await supabase.rpc("record_clinical_document_access", {
    target_document_id: id,
    access_event: "downloaded",
  });
  if (audit.error) {
    console.error("ASTER_DOCUMENT_AUDIT_ERROR", {
      code: audit.error.code,
      message: audit.error.message,
      documentId: id,
      event: "downloaded",
    });
  }

  return NextResponse.redirect(new URL(signed.data.signedUrl, request.url));
}
