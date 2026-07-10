import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) { const { next, error } = await searchParams; return <AuthShell title="Acesse sua conta" description="Entre para gerenciar a rotina da sua clínica.">{error === "configuration" && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">A autenticação não está configurada neste ambiente. Configure as variáveis do Supabase e tente novamente.</p>}<LoginForm nextPath={next?.startsWith("/") ? next : undefined} /></AuthShell>; }
