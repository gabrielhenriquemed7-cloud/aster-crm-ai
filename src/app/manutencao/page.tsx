import Link from "next/link";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Manutenção | ASTER CRM AI" };

export default function MaintenancePage() {
  return <main className="grid min-h-dvh place-items-center bg-background p-6"><EmptyState className="w-full max-w-xl" icon={<Construction className="size-5" />} title="ASTER em manutenção" description="Estamos realizando melhorias programadas. Tente acessar novamente em alguns minutos." action={<Button variant="outline" render={<Link href="/dashboard" />}>Tentar acessar o ASTER</Button>} /></main>;
}
