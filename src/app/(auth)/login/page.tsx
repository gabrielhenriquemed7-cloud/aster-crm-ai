import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { const { next } = await searchParams; return <AuthShell title="Acesse sua conta" description="Entre para gerenciar a rotina da sua clínica."><LoginForm nextPath={next?.startsWith("/") ? next : undefined} /></AuthShell>; }
