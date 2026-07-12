import Link from "next/link";
import type { ReactNode } from "react";

const tabs = [
  ["clinica", "Clínica"], ["profissionais", "Profissionais"], ["agenda", "Agenda"], ["documentos", "Documentos"],
  ["identidade", "Identidade visual"], ["ia", "IA Clínica"], ["usuarios", "Usuários e permissões"],
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <section className="space-y-6"><div><p className="text-sm text-muted-foreground">Configurações da clínica ativa</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">Configurações</h1><p className="mt-2 text-sm text-muted-foreground">Organize identidade, equipe, agenda e documentos do ASTER.</p></div><nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" aria-label="Abas de configurações">{tabs.map(([slug, label]) => <Link key={slug} href={`/configuracoes/${slug}`} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{label}</Link>)}</nav>{children}</section>;
}
