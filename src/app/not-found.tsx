import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() { return <main className="grid min-h-dvh place-items-center bg-background p-6"><EmptyState className="w-full max-w-xl border-0" title="Página não encontrada" description="O endereço informado não existe ou não está mais disponível." icon={<span className="text-sm font-bold">404</span>} action={<Button render={<Link href="/dashboard" />}>Ir para o dashboard</Button>} /></main>; }
