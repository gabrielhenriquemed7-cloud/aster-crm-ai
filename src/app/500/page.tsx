import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export const metadata = { title: "Erro interno | ASTER CRM AI" };

export default function InternalErrorPage() {
  return <main className="grid min-h-dvh place-items-center bg-background p-6"><ErrorState className="w-full max-w-xl" title="Erro interno do ASTER" description="Ocorreu uma falha inesperada. Tente novamente ou retorne ao dashboard." action={<div className="flex flex-wrap justify-center gap-2"><Button render={<Link href="/dashboard" />}>Ir para o dashboard</Button><Button variant="outline" render={<Link href="/500" />}>Tentar novamente</Button></div>} /></main>;
}
