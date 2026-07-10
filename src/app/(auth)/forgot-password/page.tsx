import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export default function ForgotPasswordPage() { return <AuthShell title="Recuperar senha" description="Informe seu e-mail para receber o link de redefinição."><ForgotPasswordForm /></AuthShell>; }
